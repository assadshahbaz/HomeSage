import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { HealthIndicator } from '../../core/health-indicator.js';
import { REDIS_CLIENT } from './redis.symbol.js';

/** Answers whether Redis is reachable. */
@Injectable()
export class RedisHealthIndicator implements HealthIndicator {
  public readonly name = 'redis';

  public constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  public async ping(): Promise<void> {
    await this.client.ping();
  }
}
