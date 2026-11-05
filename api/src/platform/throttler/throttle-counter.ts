import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { REDIS_CLIENT } from '../../infra/redis/redis.symbol.js';

const KEY_PREFIX = 'homesage:throttle';

// One round trip, run atomically by Redis: count the hit, start the window on
// the first one, and report how long the window has left. A key found with no
// expiry, which a crash between INCR and PEXPIRE could leave, gets one here.
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

const hitReplySchema = z.tuple([z.number().int().positive(), z.number().int().nonnegative()]);

/** One counted request: how many the caller has made this window, and when the window ends. */
export interface ThrottleHit {
  readonly count: number;
  readonly resetInMs: number;
}

/**
 * A fixed window counter per key, kept in Redis so every API instance shares
 * it and a restart does not reset it. Each window expires on its own.
 */
@Injectable()
export class ThrottleCounter {
  public constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Counts one request for `scope` from `caller` in a window of `windowMs`. */
  public async hit(scope: string, caller: string, windowMs: number): Promise<ThrottleHit> {
    const reply: unknown = await this.redis.eval(
      HIT_SCRIPT,
      1,
      `${KEY_PREFIX}:${scope}:${caller}`,
      String(windowMs),
    );
    const [count, resetInMs] = hitReplySchema.parse(reply);
    return { count, resetInMs };
  }
}
