import type { INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../src/infra/redis/redis.symbol.ts';

/** Deletes every rate limit counter, so an e2e file starts from a clean window. */
export async function clearThrottleCounters(app: INestApplication): Promise<void> {
  const redis = app.get<Redis>(REDIS_CLIENT);
  const keys = await redis.keys('homesage:throttle:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
