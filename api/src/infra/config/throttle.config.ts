import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { validateEnv } from './env.validation.js';

/** Per IP request limit on throttled endpoints, counted in Redis. */
export const throttleConfig = registerAs('throttle', () => {
  const env = validateEnv(process.env);

  return {
    limit: env.THROTTLE_LIMIT,
    windowMs: env.THROTTLE_WINDOW_MS,
  };
});

export type ThrottleConfig = ConfigType<typeof throttleConfig>;
