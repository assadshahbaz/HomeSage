import { Inject, Injectable } from '@nestjs/common';
import type { HealthResponse, ServiceHealth } from '../../contracts/index.js';
import type { HealthIndicator } from '../../core/health-indicator.js';
import { HEALTH_INDICATORS } from './health.symbol.js';

// Short on purpose: the point of the endpoint is to answer even when a service
// has stopped answering, so a hung check must not hold the response open.
const CHECK_TIMEOUT_MS = 2_000;

/** Asks every backing service whether it is alive and sums the answers up. */
@Injectable()
export class HealthService {
  public constructor(
    @Inject(HEALTH_INDICATORS) private readonly indicators: readonly HealthIndicator[],
  ) {}

  /** Checks every service in parallel. One failure makes the whole result `down`. */
  public async check(): Promise<HealthResponse> {
    const services = await Promise.all(
      this.indicators.map((indicator) => this.checkOne(indicator)),
    );

    return {
      status: services.every((service) => service.status === 'up') ? 'up' : 'down',
      services,
    };
  }

  private async checkOne(indicator: HealthIndicator): Promise<ServiceHealth> {
    const startedAt = Date.now();

    try {
      await withTimeout(indicator.ping(), CHECK_TIMEOUT_MS);
      return { name: indicator.name, status: 'up', latencyMs: Date.now() - startedAt };
    } catch {
      // Why it failed stays out of the response: a public endpoint has no
      // business handing out connection strings or driver errors.
      return { name: indicator.name, status: 'down', latencyMs: Date.now() - startedAt };
    }
  }
}

async function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`No answer within ${timeoutMs} ms`));
    }, timeoutMs);
  });

  try {
    await Promise.race([promise, expiry]);
  } finally {
    clearTimeout(timer);
  }
}
