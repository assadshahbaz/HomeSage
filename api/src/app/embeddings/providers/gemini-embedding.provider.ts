import { GoogleGenAI } from '@google/genai';
import type { Content } from '@google/genai';
import { HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import type {
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResponse,
} from '../../../core/embedding-provider.js';
import type { EmbeddingsConfig } from '../../../infra/config/embeddings.config.js';

// Gemini's names for the two sides of retrieval.
const TASK_TYPE = {
  DOCUMENT: 'RETRIEVAL_DOCUMENT',
  QUERY: 'RETRIEVAL_QUERY',
} as const;

type TaskType = (typeof TASK_TYPE)[keyof typeof TASK_TYPE];

// One attempt per SDK call. The SDK retries five times by default with delays
// of up to a minute, which would stack under `EmbeddingService`'s own retries
// and run past the batch deadline.
const SDK_ATTEMPTS = 1;

// Widened on purpose, as in the exception filter: statuses here are plain numbers.
const TOO_MANY_REQUESTS: number = HttpStatus.TOO_MANY_REQUESTS;
const SERVER_ERROR_FLOOR: number = HttpStatus.INTERNAL_SERVER_ERROR;

const embedResponseSchema = z.object({
  embeddings: z.array(z.object({ values: z.array(z.number()) })),
});
const countResponseSchema = z.object({ totalTokens: z.number().int().nonnegative() });
const statusSchema = z.object({ status: z.number(), message: z.string().optional() });
// How Gemini names the wait on a rate limit, in seconds with a fraction.
const RETRY_DELAY = /retry in ([\d.]+)s/i;
const MS_PER_SECOND = 1000;

/**
 * Embeds through Google's `@google/genai` SDK directly. The only file in the
 * API that imports the SDK for embeddings; tests hand the constructor a stub
 * client.
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  public constructor(private readonly client: Pick<GoogleGenAI, 'models'>) {}

  /** Builds the adapter from the `embeddings` config. Refuses to boot without a key. */
  public static fromConfig(config: EmbeddingsConfig): GeminiEmbeddingProvider {
    if (config.apiKey === null) {
      throw new Error(`EMBED_API_KEY is required when EMBED_PROVIDER is ${config.provider}`);
    }
    const client = new GoogleGenAI({
      apiKey: config.apiKey,
      httpOptions: { retryOptions: { attempts: SDK_ATTEMPTS } },
    });
    return new GeminiEmbeddingProvider(client);
  }

  public embedDocuments(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return this.embed(request, TASK_TYPE.DOCUMENT);
  }

  public embedQueries(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return this.embed(request, TASK_TYPE.QUERY);
  }

  /**
   * Rate limits and server errors carry a status; a dropped connection is a
   * `TypeError` from fetch. A rate limit names its wait in the message
   * ("Please retry in 29.55s."), which is honoured over the service's backoff.
   */
  public retryAfterMs(error: unknown): number | null {
    const parsed = statusSchema.safeParse(error);
    if (!parsed.success) {
      return error instanceof TypeError ? 0 : null;
    }
    const { status, message } = parsed.data;
    if (status !== TOO_MANY_REQUESTS && status < SERVER_ERROR_FLOOR) {
      return null;
    }
    const delay = RETRY_DELAY.exec(message ?? '');
    return delay ? Math.ceil(Number(delay[1]) * MS_PER_SECOND) : 0;
  }

  private async embed(request: EmbeddingRequest, taskType: TaskType): Promise<EmbeddingResponse> {
    // One Content per text. An array of plain strings is read as the parts of a
    // single content, and comes back as one vector for all of them together.
    const contents: Content[] = request.texts.map((text) => ({ role: 'user', parts: [{ text }] }));

    // The embedding response carries no token count, so the same contents are
    // counted alongside it. Counting is free and runs in parallel.
    const [embedded, counted] = await Promise.all([
      this.client.models.embedContent({
        model: request.model,
        contents,
        config: {
          taskType,
          outputDimensionality: request.dimensions,
          abortSignal: request.signal,
        },
      }),
      this.client.models.countTokens({
        model: request.model,
        contents,
        config: { abortSignal: request.signal },
      }),
    ]);

    return {
      vectors: embedResponseSchema.parse(embedded).embeddings.map((embedding) => embedding.values),
      inputTokens: countResponseSchema.parse(counted).totalTokens,
    };
  }
}
