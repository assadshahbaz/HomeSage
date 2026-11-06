import { Global, Module, RequestMethod } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AppLogger } from './app-logger.js';
import { RequestLoggingMiddleware } from './request-logging.middleware.js';

@Global()
@Module({
  providers: [AppLogger, RequestLoggingMiddleware],
  exports: [AppLogger],
})
export class LoggingModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestLoggingMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
