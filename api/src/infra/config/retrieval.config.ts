import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { validateEnv } from './env.validation.js';

/** How long hybrid retrieval waits for each of its branches. */
export const retrievalConfig = registerAs('retrieval', () => {
  const env = validateEnv(process.env);

  return {
    branchTimeoutMs: env.RETRIEVAL_BRANCH_TIMEOUT_MS,
  };
});

export type RetrievalConfig = ConfigType<typeof retrievalConfig>;
