import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { validateEnv } from './env.validation.js';

/**
 * Connection settings for the derived search index. Nothing here is a source of
 * truth: the index can be dropped and rebuilt from MySQL at any time.
 */
export const elasticsearchConfig = registerAs('elasticsearch', () => {
  const env = validateEnv(process.env);

  return {
    url: env.ES_URL,
    requestTimeoutMs: env.ES_REQUEST_TIMEOUT_MS,
    index: env.ES_INDEX,
  };
});

export type ElasticsearchConfig = ConfigType<typeof elasticsearchConfig>;
