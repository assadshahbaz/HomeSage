import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { validateEnv } from './env.validation.js';

/** Connection settings for the cache, rate limit counters and chat history. */
export const redisConfig = registerAs('redis', () => {
  const env = validateEnv(process.env);

  return {
    url: env.REDIS_URL,
    commandTimeoutMs: env.REDIS_COMMAND_TIMEOUT_MS,
  };
});

export type RedisConfig = ConfigType<typeof redisConfig>;
