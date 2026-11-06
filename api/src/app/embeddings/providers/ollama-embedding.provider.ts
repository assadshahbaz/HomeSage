import { HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import type {
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResponse,
} from '../../../core/embedding-provider.js';
import type { EmbeddingsConfig } from '../../../infra/config/embeddings.config.js';

const EMBED_PATH = '/api/embed';

// Widened on purpose, as in the exception filter: statuses here are plain numbers.
const SERVER_ERROR_FLOOR: number = HttpStatus.INTERNAL_SERVER_ERROR;

const embedResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())),
  // Tokens the model read across every input. The only count Ollama gives.
  prompt_eval_count: z.number().int().nonnegative(),
});
const errorBodySchema = z.object({ error: z.string() });
const statusSchema = z.object({ status: z.number() });

/** Where the server listens and what goes before each text, from config. */
export interface OllamaSettings {
  readonly baseUrl: string;
  readonly documentPrefix: string | null;
  readonly queryPrefix: string | null;
}

/** A response from Ollama that was not a success, with its status. */
class OllamaResponseError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'OllamaResponseError';
  }
}

/**
 * Embeds through a local Ollama server's HTTP API with `fetch`, so there is no
 * SDK and no key. Models that expect a marker before each document or query
 * (such as "search_document:") get it from config. Tests hand the constructor
 * a stub `fetch`.
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  public constructor(
    private readonly settings: OllamaSettings,
    private readonly fetchFn: typeof fetch,
  ) {}

  /** Builds the adapter from the `embeddings` config. Refuses to boot without the server's URL. */
  public static fromConfig(config: EmbeddingsConfig): OllamaEmbeddingProvider {
    if (config.baseUrl === null) {
      throw new Error(`EMBED_BASE_URL is required when EMBED_PROVIDER is ${config.provider}`);
    }
    return new OllamaEmbeddingProvider(
      {
        baseUrl: config.baseUrl,
        documentPrefix: config.documentPrefix,
        queryPrefix: config.queryPrefix,
      },
      fetch,
    );
  }

  public embedDocuments(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return this.embed(request, this.settings.documentPrefix);
  }

  public embedQueries(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return this.embed(request, this.settings.queryPrefix);
  }

  /**
   * A dropped or refused connection is a `TypeError` from fetch, and a server
   * error may pass; both are worth another try. A 4xx, such as a model that was
   * never pulled, will fail the same way again.
   */
  public retryAfterMs(error: unknown): number | null {
    const parsed = statusSchema.safeParse(error);
    if (!parsed.success) {
      return error instanceof TypeError ? 0 : null;
    }
    return parsed.data.status >= SERVER_ERROR_FLOOR ? 0 : null;
  }

  private async embed(
    request: EmbeddingRequest,
    prefix: string | null,
  ): Promise<EmbeddingResponse> {
    const response = await this.fetchFn(new URL(EMBED_PATH, this.settings.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        input: request.texts.map((text) => (prefix === null ? text : `${prefix} ${text}`)),
        // A text longer than the model's context fails loudly rather than
        // being embedded cut short.
        truncate: false,
      }),
      signal: request.signal,
    });

    if (!response.ok) {
      throw new OllamaResponseError(
        `Ollama answered ${String(response.status)}: ${await errorMessage(response)}`,
        response.status,
      );
    }

    const body = embedResponseSchema.parse(await response.json());
    return { vectors: body.embeddings, inputTokens: body.prompt_eval_count };
  }
}

/** Ollama's own explanation from an error response, or the raw body when it is not JSON. */
async function errorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = errorBodySchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.error : text;
  } catch {
    return text;
  }
}
