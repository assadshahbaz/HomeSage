import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { HealthResponse } from '../../contracts/index.js';
import { HealthController } from './health.controller.js';
import type { HealthService } from './health.service.js';

function controllerReporting(result: HealthResponse): HealthController {
  return new HealthController({
    check: vi.fn().mockResolvedValue(result),
  } as unknown as HealthService);
}

const ALL_UP: HealthResponse = {
  status: 'up',
  services: [
    { name: 'mysql', status: 'up', latencyMs: 2 },
    { name: 'elasticsearch', status: 'up', latencyMs: 5 },
    { name: 'redis', status: 'up', latencyMs: 1 },
  ],
};

const REDIS_DOWN: HealthResponse = {
  status: 'down',
  services: [
    { name: 'mysql', status: 'up', latencyMs: 2 },
    { name: 'elasticsearch', status: 'up', latencyMs: 5 },
    { name: 'redis', status: 'down', latencyMs: 2000 },
  ],
};

describe('HealthController', () => {
  it('returns the report when everything is up', async () => {
    await expect(controllerReporting(ALL_UP).check()).resolves.toEqual(ALL_UP);
  });

  it('answers 503 when a service is down', async () => {
    await expect(controllerReporting(REDIS_DOWN).check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('names the failing service in the 503 body', async () => {
    const error = await controllerReporting(REDIS_DOWN)
      .check()
      .catch((thrown: unknown) => thrown);

    expect((error as ServiceUnavailableException).getResponse()).toEqual(REDIS_DOWN);
  });
});
