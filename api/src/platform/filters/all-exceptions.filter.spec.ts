import {
  BadRequestException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AppLogger } from '../logging/app-logger.js';
import { RequestContextService } from '../request-context/request-context.service.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

const REQUEST_ID = 'req-abc-123';
const PATH = '/chat';

function fire(
  exception: unknown,
  requestId: string | null = REQUEST_ID,
): {
  body: Record<string, unknown>;
  status: number;
  logged: { error: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
} {
  const logged = { error: vi.fn(), debug: vi.fn() };
  const logger = logged as unknown as AppLogger;
  const context = new RequestContextService();

  let status = 0;
  let body: Record<string, unknown> = {};
  const response = {
    status: (code: number) => {
      status = code;
      return response;
    },
    json: (payload: Record<string, unknown>) => {
      body = payload;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ url: PATH, method: 'POST' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  const filter = new AllExceptionsFilter(logger, context);
  if (requestId === null) {
    filter.catch(exception, host);
  } else {
    context.run({ requestId }, () => {
      filter.catch(exception, host);
    });
  }

  return { body, status, logged };
}

describe('AllExceptionsFilter', () => {
  it('shapes a thrown HttpException', () => {
    const { body, status } = fire(new BadRequestException('Question is empty'));

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toEqual({
      statusCode: 400,
      message: 'Question is empty',
      error: 'Bad Request',
      path: PATH,
      timestamp: expect.any(String),
      requestId: REQUEST_ID,
    });
  });

  it('keeps an object body the throw site chose', () => {
    const report = { status: 'down', services: [{ name: 'redis', status: 'down' }] };

    const { body, status } = fire(new ServiceUnavailableException(report));

    expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(body).toMatchObject({ ...report, statusCode: 503, requestId: REQUEST_ID });
  });

  it('carries a machine readable code through', () => {
    const { body } = fire(
      new HttpException(
        { errorCode: 'E_SQL_REJECTED', message: 'Query not allowed' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      ),
    );

    expect(body).toMatchObject({ statusCode: 422, errorCode: 'E_SQL_REJECTED' });
  });

  it('turns an unknown error into a bare 500', () => {
    const { body, status } = fire(new Error('connect ECONNREFUSED 127.0.0.1:3306'));

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
      path: PATH,
      timestamp: expect.any(String),
      requestId: REQUEST_ID,
    });
  });

  it.each([
    ['an error', new Error('connect ECONNREFUSED 127.0.0.1:3306')],
    ['a thrown string', 'MYSQL_RO_PASSWORD=hunter2'],
    ['a thrown object', { query: 'SELECT * FROM properties', apiKey: 'sk-ant-secret' }],
  ])('leaks nothing from %s', (_label, thrown) => {
    const { body } = fire(thrown);

    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|hunter2|sk-ant-secret|SELECT/);
    expect(body).not.toHaveProperty('stack');
  });

  it('logs a 500 at error level with the stack', () => {
    const failure = new Error('boom');

    const { logged } = fire(failure);

    expect(logged.error).toHaveBeenCalledWith(
      expect.stringContaining(PATH),
      failure.stack,
      'AllExceptionsFilter',
    );
    expect(logged.debug).not.toHaveBeenCalled();
  });

  it('logs a 4xx at debug level, without a stack', () => {
    const { logged } = fire(new BadRequestException('Question is empty'));

    expect(logged.debug).toHaveBeenCalledWith(expect.stringContaining(PATH), 'AllExceptionsFilter');
    expect(logged.error).not.toHaveBeenCalled();
  });

  it('still answers when there is no request context', () => {
    const { body, status } = fire(new BadRequestException('Question is empty'), null);

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body['requestId']).toBeUndefined();
  });
});
