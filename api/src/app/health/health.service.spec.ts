import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HealthIndicator } from '../../core/health-indicator.js';
import { HealthService } from './health.service.js';

const CHECK_TIMEOUT_MS = 2_000;

function indicator(name: string, ping: () => Promise<void>): HealthIndicator {
  return { name, ping };
}

const up = (name: string): HealthIndicator => indicator(name, () => Promise.resolve());
const down = (name: string): HealthIndicator =>
  indicator(name, () => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:3306')));
const hung = (name: string): HealthIndicator => indicator(name, () => new Promise<void>(() => {}));

afterEach(() => {
  vi.useRealTimers();
});

describe('HealthService', () => {
  it('reports up with a latency for every service that answered', async () => {
    const service = new HealthService([up('mysql'), up('elasticsearch'), up('redis')]);

    const result = await service.check();

    expect(result.status).toBe('up');
    expect(result.services).toEqual([
      { name: 'mysql', status: 'up', latencyMs: expect.any(Number) },
      { name: 'elasticsearch', status: 'up', latencyMs: expect.any(Number) },
      { name: 'redis', status: 'up', latencyMs: expect.any(Number) },
    ]);
  });

  it('names the failing service and still reports the healthy ones', async () => {
    const service = new HealthService([up('mysql'), down('elasticsearch'), up('redis')]);

    const result = await service.check();

    expect(result.status).toBe('down');
    expect(result.services.map(({ name, status }) => [name, status])).toEqual([
      ['mysql', 'up'],
      ['elasticsearch', 'down'],
      ['redis', 'up'],
    ]);
  });

  it('keeps the driver error out of the response', async () => {
    const service = new HealthService([down('mysql')]);

    const result = await service.check();

    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED');
  });

  it('gives up on a service that never answers', async () => {
    vi.useFakeTimers();
    const service = new HealthService([up('mysql'), hung('redis')]);

    const pending = service.check();
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);
    const result = await pending;

    expect(result.status).toBe('down');
    expect(result.services).toContainEqual({
      name: 'redis',
      status: 'down',
      latencyMs: expect.any(Number),
    });
  });

  it('waits for a slow service that answers inside the timeout', async () => {
    vi.useFakeTimers();
    const slow = indicator(
      'elasticsearch',
      () => new Promise<void>((resolve) => setTimeout(resolve, CHECK_TIMEOUT_MS / 2)),
    );
    const service = new HealthService([slow]);

    const pending = service.check();
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);

    await expect(pending).resolves.toMatchObject({ status: 'up' });
  });

  it('checks the services in parallel, not one after another', async () => {
    vi.useFakeTimers();
    const slow = (name: string): HealthIndicator =>
      indicator(name, () => new Promise<void>((resolve) => setTimeout(resolve, 1_000)));
    const service = new HealthService([slow('mysql'), slow('elasticsearch'), slow('redis')]);

    const pending = service.check();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toMatchObject({ status: 'up' });
  });
});
