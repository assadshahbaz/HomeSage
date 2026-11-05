import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { validateEnv } from './env.validation.js';

/**
 * Settings for turning property documents into vectors. `dimensions` has to
 * match both the model and the index mapping, so changing either one means a
 * new index and a full rebuild.
 */
export const embeddingsConfig = registerAs('embeddings', () => {
  const env = validateEnv(process.env);

  return {
    provider: env.EMBED_PROVIDER,
    apiKey: env.EMBED_API_KEY ?? null,
    baseUrl: env.EMBED_BASE_URL ?? null,
    documentPrefix: env.EMBED_DOCUMENT_PREFIX ?? null,
    queryPrefix: env.EMBED_QUERY_PREFIX ?? null,
    model: env.EMBED_MODEL,
    dimensions: env.EMBED_DIMENSIONS,
    batchSize: env.EMBED_BATCH_SIZE,
    timeoutMs: env.EMBED_TIMEOUT_MS,
    maxAttempts: env.EMBED_MAX_ATTEMPTS,
    textsPerMinute: env.EMBED_TEXTS_PER_MINUTE ?? null,
    inputUsdPerMillion: env.EMBED_INPUT_USD_PER_MILLION,
  };
});

export type EmbeddingsConfig = ConfigType<typeof embeddingsConfig>;
