import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppLogger } from './app-logger.js';

/** One line per finished request, stamped with the id like every other line. */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  public constructor(private readonly logger: AppLogger) {}

  public use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now();

    // Async local storage reads the context at the call, not where the listener
    // was registered, and `finish` fires inside the request. Order cannot break it.
    response.on('finish', () => {
      this.logger.log(
        `${request.method} ${request.url} ${String(response.statusCode)}`,
        {
          method: request.method,
          path: request.url,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        },
        RequestLoggingMiddleware.name,
      );
    });

    next();
  }
}
