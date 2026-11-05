import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { validateEnv } from './env.validation.js';

/** Settings for the process itself: the port it listens on and how it logs. */
export const appConfig = registerAs('app', () => {
  const env = validateEnv(process.env);

  return {
    port: env.PORT,
    environment: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
  };
});

export type AppConfig = ConfigType<typeof appConfig>;
