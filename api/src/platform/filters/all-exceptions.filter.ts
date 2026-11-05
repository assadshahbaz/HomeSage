import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { isString } from '../../contracts/index.js';
import { AppLogger } from '../logging/app-logger.js';
import { RequestContextService } from '../request-context/request-context.service.js';

const UNKNOWN_ERROR_MESSAGE = 'Internal server error';

// Widened on purpose: `status` is a plain number, and comparing it to the enum member itself
// would claim the two share a type.
const SERVER_ERROR_FLOOR: number = HttpStatus.INTERNAL_SERVER_ERROR;

/**
 * The single place a thrown value becomes a response. Throw sites stay free of
 * formatting, and nothing a caller has no use for reaches the body.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  public constructor(
    private readonly logger: AppLogger,
    private readonly context: RequestContextService,
  ) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const status = statusOf(exception);
    const body = {
      ...describe(exception, status),
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId: this.context.getRequestId(),
    };

    this.record(exception, status, request);
    response.status(status).json(body);
  }

  private record(exception: unknown, status: number, request: Request): void {
    const summary = `${request.method} ${request.url} failed with ${status}`;

    if (status >= SERVER_ERROR_FLOOR) {
      this.logger.error(summary, stackOf(exception), AllExceptionsFilter.name);
      return;
    }

    this.logger.debug(summary, AllExceptionsFilter.name);
  }
}

function statusOf(exception: unknown): number {
  return exception instanceof HttpException
    ? exception.getStatus()
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

/**
 * The part of the body that describes the failure. Anything that is not an
 * `HttpException` was never meant to be seen, so it becomes a bare 500.
 */
function describe(exception: unknown, status: number): Record<string, unknown> {
  if (!(exception instanceof HttpException)) {
    return { statusCode: status, message: UNKNOWN_ERROR_MESSAGE };
  }

  const payload = exception.getResponse();
  if (isString(payload)) {
    return { statusCode: status, message: payload };
  }

  // The throw site chose this body, so it is kept whole: `/health` sends its
  // service list this way.
  return { statusCode: status, ...payload };
}

function stackOf(exception: unknown): string {
  return exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
}
