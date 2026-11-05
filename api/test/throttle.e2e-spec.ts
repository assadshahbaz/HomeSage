import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module.ts';
import type { LlmCompletion } from '../src/core/llm-provider.ts';
import { LlmService } from '../src/app/llm/llm.service.ts';
import { REDIS_CLIENT } from '../src/infra/redis/redis.symbol.ts';
import { AllExceptionsFilter } from '../src/platform/filters/all-exceptions.filter.ts';
import { AppLogger } from '../src/platform/logging/app-logger.ts';
import { RequestContextService } from '../src/platform/request-context/request-context.service.ts';
import { clearThrottleCounters } from './throttle-counters.ts';

const LIMIT = 2;
const WINDOW_MS = 60_000;

/**
 * Trips the per IP limit on `POST /sql` against the Docker Redis, then boots a
 * second app to show the count survived the first one shutting down.
 */
describe('rate limiting on POST /sql', () => {
  const complete = vi.fn<() => Promise<LlmCompletion>>(() =>
    Promise.resolve({
      text: 'SELECT p.id FROM properties p WHERE p.id = 1',
      model: 'answer-model',
      inputTokens: 1,
      outputTokens: 1,
      stopReason: 'STOP',
    }),
  );

  async function startApp(): Promise<INestApplication> {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LlmService)
      .useValue({ complete })
      .compile();
    const app = testingModule.createNestApplication();
    const logger = app.get(AppLogger);
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(logger, level).mockImplementation(() => undefined);
    }
    app.useGlobalFilters(new AllExceptionsFilter(logger, app.get(RequestContextService)));
    await app.init();
    return app;
  }

  function ask(app: INestApplication): request.Test {
    return request(app.getHttpServer()).post('/sql').send({ question: 'listing 1' });
  }

  let app: INestApplication;

  beforeAll(async () => {
    process.env['THROTTLE_LIMIT'] = String(LIMIT);
    process.env['THROTTLE_WINDOW_MS'] = String(WINDOW_MS);
    app = await startApp();
    await clearThrottleCounters(app);
  });

  afterAll(async () => {
    await clearThrottleCounters(app);
    await app.close();
    delete process.env['THROTTLE_LIMIT'];
    delete process.env['THROTTLE_WINDOW_MS'];
  });

  it('serves requests up to the limit', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await ask(app).expect(200);
    }
    expect(complete).toHaveBeenCalledTimes(LIMIT);
  });

  it('refuses the next one with 429, Retry-After and an error code, before any model call', async () => {
    const response = await ask(app).expect(429);

    const retryAfter = Number(response.headers['retry-after']);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(WINDOW_MS / 1000);
    expect(response.body).toMatchObject({
      statusCode: 429,
      errorCode: 'E_RATE_LIMITED',
      message: 'Too many requests, try again later',
      requestId: expect.any(String) as string,
    });
    expect(complete).toHaveBeenCalledTimes(LIMIT);
  });

  it('keeps the counter in Redis with an expiry, not in the process', async () => {
    const redis = app.get<Redis>(REDIS_CLIENT);
    const [key] = await redis.keys('homesage:throttle:sql:*');

    expect(key).toBeDefined();
    expect(Number(await redis.get(key))).toBeGreaterThan(LIMIT);
    expect(await redis.pttl(key)).toBeGreaterThan(0);
  });

  it('still refuses after the API restarts, since the counter outlived it', async () => {
    await app.close();
    app = await startApp();

    await ask(app).expect(429);
  });

  it('leaves endpoints without the decorator alone', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
