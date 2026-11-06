import { Global, Module, RequestMethod } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { RequestContextMiddleware } from './request-context.middleware.js';
import { RequestContextService } from './request-context.service.js';

@Global()
@Module({
  providers: [RequestContextService, RequestContextMiddleware],
  exports: [RequestContextService],
})
export class RequestContextModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
