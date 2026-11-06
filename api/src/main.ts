import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { AppConfig } from './infra/config/app.config.js';
import { AllExceptionsFilter } from './platform/filters/all-exceptions.filter.js';
import { AppLogger } from './platform/logging/app-logger.js';
import { RequestContextService } from './platform/request-context/request-context.service.js';

async function bootstrap(): Promise<void> {
  // Buffered until our own logger exists, so boot lines come out in one format.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(AppLogger);
  app.useLogger(logger);
  app.useGlobalFilters(new AllExceptionsFilter(logger, app.get(RequestContextService)));

  const { port } = app.get(ConfigService).getOrThrow<AppConfig>('app');
  await app.listen(port);
}
await bootstrap();
