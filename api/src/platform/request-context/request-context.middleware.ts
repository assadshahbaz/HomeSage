import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service.js';
import { REQUEST_ID_HEADER, toRequestId } from './request-id.js';

/** Opens the request context and echoes the id back to the caller. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  public constructor(private readonly context: RequestContextService) {}

  public use(request: Request, response: Response, next: NextFunction): void {
    const requestId = toRequestId(request.headers[REQUEST_ID_HEADER]);
    response.setHeader(REQUEST_ID_HEADER, requestId);

    this.context.run({ requestId }, next);
  }
}
