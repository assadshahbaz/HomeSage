import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.ts';
import { AllExceptionsFilter } from '../src/platform/filters/all-exceptions.filter.ts';
import { AppLogger } from '../src/platform/logging/app-logger.ts';
import { RequestContextService } from '../src/platform/request-context/request-context.service.ts';
import { REQUEST_ID_HEADER } from '../src/platform/request-context/request-id.ts';

const SAFE_ID = 'e2e-request-id-1';
// Node refuses to send a header containing a newline, so the one a real client
// could get past a proxy is this: legal HTTP, but not something to log as is.
const FORGED_ID = 'forged level=error message=owned';

/**
 * Boots the real app so the middleware order, the logger and the filter are
 * exercised together. Needs the Docker services, since `/health` reaches them.
 */
describe('request ids', () => {
  let app: INestApplication;
  let lines: { message: unknown; params: unknown[]; requestId: string | undefined }[];

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = testingModule.createNestApplication();

    // Read what the app logs, without writing any of it to the test output.
    lines = [];
    const logger = app.get(AppLogger);
    const context = app.get(RequestContextService);
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(logger, level).mockImplementation((message: unknown, ...params: unknown[]) => {
        // The id is read the same way the real logger's mixin reads it, which
        // is what proves the line was written inside the request context.
        lines.push({ message, params, requestId: context.getRequestId() });
      });
    }

    // The same wiring main.ts does, since a testing module builds the app
    // itself and would otherwise run without the global filter.
    app.useGlobalFilters(new AllExceptionsFilter(logger, app.get(RequestContextService)));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    lines = [];
  });

  it('echoes an id the caller chose', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set(REQUEST_ID_HEADER, SAFE_ID)
      .expect(200);

    expect(response.headers[REQUEST_ID_HEADER]).toBe(SAFE_ID);
  });

  it('replaces an id that could forge a log line', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set(REQUEST_ID_HEADER, FORGED_ID)
      .expect(200);

    expect(response.headers[REQUEST_ID_HEADER]).not.toContain('level=error');
    expect(response.headers[REQUEST_ID_HEADER]).toEqual(expect.any(String));
  });

  it('generates one when the caller sent none', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.headers[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('logs the finished request under the same id the caller was given', async () => {
    await request(app.getHttpServer()).get('/health').set(REQUEST_ID_HEADER, SAFE_ID).expect(200);

    const requestLine = lines.find(
      (line) => typeof line.message === 'string' && line.message.includes('GET /health'),
    );

    expect(requestLine).toBeDefined();
    expect(requestLine?.requestId).toBe(SAFE_ID);
    expect(requestLine?.params).toContainEqual(
      expect.objectContaining({ statusCode: 200, path: '/health' }),
    );
  });

  it('gives every line written during one request the same id', async () => {
    await request(app.getHttpServer())
      .get('/does-not-exist')
      .set(REQUEST_ID_HEADER, SAFE_ID)
      .expect(404);

    expect(lines).not.toHaveLength(0);
    expect(lines.map((line) => line.requestId)).toEqual(lines.map(() => SAFE_ID));
  });

  it('shapes an unmatched route through the filter, with the request id', async () => {
    const response = await request(app.getHttpServer())
      .get('/does-not-exist')
      .set(REQUEST_ID_HEADER, SAFE_ID)
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      path: '/does-not-exist',
      requestId: SAFE_ID,
      timestamp: expect.any(String),
    });
  });

  it('leaks no stack on an error response', async () => {
    const response = await request(app.getHttpServer()).get('/does-not-exist').expect(404);

    expect(response.body).not.toHaveProperty('stack');
  });
});
