import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { validateEnv } from './env.validation.js';

/**
 * Connection settings for the read only account. These are the only MySQL
 * credentials the API has: root belongs to the container and the import tool.
 */
export const mysqlConfig = registerAs('mysql', () => {
  const env = validateEnv(process.env);

  return {
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    database: env.MYSQL_DATABASE,
    user: env.MYSQL_RO_USER,
    password: env.MYSQL_RO_PASSWORD,
  };
});

export type MysqlConfig = ConfigType<typeof mysqlConfig>;
