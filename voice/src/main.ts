import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { AppConfig } from './infra/config/app-config.js';
import { APP_CONFIG } from './infra/config/app-config.symbol.js';

// An end of call report carries the whole transcript and message list, which a
// long call takes well past Express's 100kb default.
const JSON_BODY_LIMIT = '5mb';

async function bootstrap(): Promise<void> {
  // Variables already set in the environment win over the file.
  if (existsSync('.env')) process.loadEnvFile('.env');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.enableShutdownHooks();

  const { port } = app.get<AppConfig>(APP_CONFIG);
  await app.listen(port);
}
await bootstrap();
