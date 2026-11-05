import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { validateEnv } from './env.validation.js';

/** Limits applied to model written SQL before it reaches MySQL. */
export const sqlConfig = registerAs('sql', () => {
  const env = validateEnv(process.env);

  return {
    rowLimit: env.SQL_ROW_LIMIT,
    statementTimeoutMs: env.SQL_STATEMENT_TIMEOUT_MS,
  };
});

export type SqlConfig = ConfigType<typeof sqlConfig>;
