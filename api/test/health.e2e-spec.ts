import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.ts';
import { healthResponseSchema } from '../src/contracts/index.ts';

/**
 * Runs against the containers from docker-compose.yml. Every service has to be
 * up, so this fails on purpose when the stack is not running.
 */
describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = testingModule.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 200 with every service up', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    const body = healthResponseSchema.parse(response.body);

    expect(body.status).toBe('up');
    expect(body.services.map((service) => service.name).sort()).toEqual([
      'elasticsearch',
      'mysql',
      'redis',
    ]);
    expect(body.services.every((service) => service.status === 'up')).toBe(true);
  });

  it('reports a latency for each service', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    const body = healthResponseSchema.parse(response.body);

    for (const service of body.services) {
      expect(service.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });
});
