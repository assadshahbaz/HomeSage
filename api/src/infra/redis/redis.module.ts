import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { RedisConfig } from '../config/redis.config.js';
import { RedisHealthIndicator } from './redis.health-indicator.js';
import { REDIS_CLIENT } from './redis.symbol.js';

// A command sent while the socket is down waits for the reconnect rather than
// failing at once; `commandTimeout` is what bounds it.
const MAX_RETRIES_PER_REQUEST = 1;

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const { url, commandTimeoutMs } = configService.getOrThrow<RedisConfig>('redis');
        const client = new Redis(url, {
          maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST,
          commandTimeout: commandTimeoutMs,
        });
        const logger = new Logger('Redis');

        // ioredis emits connection failures as events, and an EventEmitter with
        // no error listener crashes the process. The health indicator is what
        // reports the state; this only keeps the retries visible.
        client.on('error', (error: Error) => {
          logger.warn(error.message);
        });

        return client;
      },
    },
    RedisHealthIndicator,
  ],
  exports: [REDIS_CLIENT, RedisHealthIndicator],
})
export class RedisModule implements OnApplicationShutdown {
  public constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  public onApplicationShutdown(): void {
    // Ends the socket and stops the reconnect loop whatever state it is in.
    this.client.disconnect();
  }
}
