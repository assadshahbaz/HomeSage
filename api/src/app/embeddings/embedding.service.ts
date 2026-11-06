import { setTimeout as sleep } from 'node:timers/promises';
import { GatewayTimeoutException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResponse,
} from '../../core/embedding-provider.js';
import type { EmbeddingsConfig } from '../../infra/config/embeddings.config.js';
import { AppLogger } from '../../platform/logging/app-logger.js';
import { embeddingCostUsd } from './embedding-cost.js';
import { EMBEDDING_PROVIDER } from './embedding.symbol.js';
import { TextsPerMinutePace } from './texts-per-minute-pace.js';

// The first pause before a retry, multiplied by BACKOFF_FACTOR for each one after it.
const FIRST_BACKOFF_MS = 500;
const BACKOFF_FACTOR = 2;
// Enough precision for a fraction of a cent, without float noise in the logs.
const COST_DECIMALS = 6;

const EMBEDDING_KIND = {
  DOCUMENT: 'document',
  QUERY: 'query',
} as const;

type EmbeddingKind = (typeof EMBEDDING_KIND)[keyof typeof EMBEDDING_KIND];

/** What a run of embedding calls used, for the ingestion summary and the eval report. */
export interface EmbeddingUsage {
  /** Provider calls that succeeded, one per batch. */
  readonly calls: number;
  readonly inputTokens: number;
  readonly costUsd: number;
}

/** Vectors in the order of the texts, with what they cost. */
export interface EmbeddedTexts {
  readonly vectors: readonly (readonly number[])[];
  readonly usage: EmbeddingUsage;
}

/** One query's vector, with what it cost. */
export interface EmbeddedQuery {
  readonly vector: readonly number[];
  readonly usage: EmbeddingUsage;
}

/**
 * The one door to the embedding model. Splits texts into batches of
 * `EMBED_BATCH_SIZE`, and with `EMBED_TEXTS_PER_MINUTE` set, holds each batch
 * back until it fits the vendor's per minute limit. Gives each batch
 * `EMBED_TIMEOUT_MS` for all its attempts, retries rate limits and transient
 * errors with exponential backoff or the wait the vendor asks for, whichever
 * is longer, checks every vector before it can reach the index, and logs what
 * each batch cost.
 */
@Injectable()
export class EmbeddingService {
  private readonly config: EmbeddingsConfig;
  private readonly pace: TextsPerMinutePace | null;

  public constructor(
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
    configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.config = configService.getOrThrow<EmbeddingsConfig>('embeddings');
    const { textsPerMinute, batchSize } = this.config;
    if (textsPerMinute !== null && batchSize > textsPerMinute) {
      throw new Error(
        `EMBED_BATCH_SIZE ${String(batchSize)} is more than EMBED_TEXTS_PER_MINUTE ${String(textsPerMinute)}, so no batch could ever be sent`,
      );
    }
    this.pace = textsPerMinute === null ? null : new TextsPerMinutePace(textsPerMinute);
  }

  /** Vectors for property documents, one per text and in the same order. */
  public embedDocuments(texts: readonly string[]): Promise<EmbeddedTexts> {
    return this.embedAll(texts, EMBEDDING_KIND.DOCUMENT);
  }

  /** The vector a search query is compared with. */
  public async embedQuery(text: string): Promise<EmbeddedQuery> {
    const { vectors, usage } = await this.embedAll([text], EMBEDDING_KIND.QUERY);
    return { vector: vectors[0], usage };
  }

  private async embedAll(texts: readonly string[], kind: EmbeddingKind): Promise<EmbeddedTexts> {
    const vectors: (readonly number[])[] = [];
    let inputTokens = 0;
    let calls = 0;
    // One batch at a time, so a rate limit meets one request rather than many.
    for (let start = 0; start < texts.length; start += this.config.batchSize) {
      const response = await this.embedBatch(
        texts.slice(start, start + this.config.batchSize),
        kind,
      );
      vectors.push(...response.vectors);
      inputTokens += response.inputTokens;
      calls += 1;
    }
    return { vectors, usage: { calls, inputTokens, costUsd: this.cost(inputTokens) } };
  }

  private async embedBatch(
    texts: readonly string[],
    kind: EmbeddingKind,
  ): Promise<EmbeddingResponse> {
    // Waiting for the per minute limit comes before the batch's deadline starts.
    await this.pace?.reserve(texts.length);
    const startedAt = Date.now();
    // One deadline for the batch, retries and pauses included.
    const signal = AbortSignal.timeout(this.config.timeoutMs);
    const request: EmbeddingRequest = {
      model: this.config.model,
      texts,
      dimensions: this.config.dimensions,
      signal,
    };

    for (let attempt = 1; ; attempt++) {
      let response: EmbeddingResponse;
      try {
        response = await this.call(kind, request);
      } catch (error) {
        if (signal.aborted) {
          throw this.timeout(error);
        }
        const retryAfterMs =
          attempt < this.config.maxAttempts ? this.provider.retryAfterMs(error) : null;
        if (retryAfterMs === null) {
          throw error;
        }
        await this.backOff(attempt, retryAfterMs, startedAt, signal, error);
        continue;
      }

      this.check(response, texts.length);
      this.logger.log(
        `embed ${kind} ${this.config.model}`,
        {
          kind,
          model: this.config.model,
          batchSize: texts.length,
          inputTokens: response.inputTokens,
          attempts: attempt,
          latencyMs: Date.now() - startedAt,
          costUsd: this.cost(response.inputTokens),
        },
        EmbeddingService.name,
      );
      return response;
    }
  }

  private call(kind: EmbeddingKind, request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return kind === EMBEDDING_KIND.DOCUMENT
      ? this.provider.embedDocuments(request)
      : this.provider.embedQueries(request);
  }

  /**
   * Waits before the next attempt, as long as the backoff or the vendor's own
   * wait, whichever is longer. A wait that cannot end before the batch deadline
   * fails at once rather than sleeping until it. Either way the vendor's error
   * is kept as the cause, since it says why the batch was refused.
   */
  private async backOff(
    attempt: number,
    retryAfterMs: number,
    startedAt: number,
    signal: AbortSignal,
    vendorError: unknown,
  ): Promise<void> {
    const waitMs = Math.max(FIRST_BACKOFF_MS * BACKOFF_FACTOR ** (attempt - 1), retryAfterMs);
    if (Date.now() + waitMs >= startedAt + this.config.timeoutMs) {
      throw this.timeout(vendorError);
    }
    try {
      await sleep(waitMs, undefined, { signal });
    } catch {
      throw this.timeout(vendorError);
    }
  }

  /**
   * A wrong count or size would put vectors in the index that nothing can be
   * compared with, or pair a vector with the wrong property. Either fails the
   * batch outright; retrying would not change what the model returns.
   */
  private check(response: EmbeddingResponse, expected: number): void {
    if (response.vectors.length !== expected) {
      throw new Error(
        `Embedding model ${this.config.model} returned ${String(response.vectors.length)} vectors for ${String(expected)} texts`,
      );
    }
    const wrong = response.vectors.findIndex((vector) => vector.length !== this.config.dimensions);
    if (wrong !== -1) {
      throw new Error(
        `Embedding model ${this.config.model} returned a vector of ${String(response.vectors[wrong].length)} dimensions, but EMBED_DIMENSIONS is ${String(this.config.dimensions)}`,
      );
    }
  }

  private timeout(cause: unknown): GatewayTimeoutException {
    return new GatewayTimeoutException(
      `Embedding model ${this.config.model} did not answer within ${String(this.config.timeoutMs)} ms`,
      { cause },
    );
  }

  private cost(inputTokens: number): number {
    return Number(
      embeddingCostUsd(inputTokens, this.config.inputUsdPerMillion).toFixed(COST_DECIMALS),
    );
  }
}
