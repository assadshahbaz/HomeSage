import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RATE_LIMITED_ERROR_CODE } from '../../contracts/index.js';
import type { ThrottleConfig } from '../../infra/config/throttle.config.js';
import { AppLogger } from '../logging/app-logger.js';
import { ThrottleCounter } from './throttle-counter.js';
import { THROTTLE_SCOPE } from './throttle-scope.js';

const MS_PER_SECOND = 1000;
// A caller whose address Express could not read still counts, in one shared bucket.
const UNKNOWN_CALLER = 'unknown';

/**
 * Counts each request to a throttled endpoint against the caller's IP and
 * refuses the one past the limit with a 429 and `Retry-After`.
 *
 * A Redis failure lets the request through. Refusing everything while Redis is
 * down would turn a cache outage into a full outage, and the model budget has
 * its own hard stops. The failure is logged so an open throttle is visible.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly config: ThrottleConfig;

  public constructor(
    private readonly counter: ThrottleCounter,
    private readonly reflector: Reflector,
    private readonly logger: AppLogger,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<ThrottleConfig>('throttle');
  }

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<string | undefined>(THROTTLE_SCOPE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (scope === undefined) {
      return true;
    }

    const http = context.switchToHttp();
    const caller = http.getRequest<Request>().ip ?? UNKNOWN_CALLER;

    let hit;
    try {
      hit = await this.counter.hit(scope, caller, this.config.windowMs);
    } catch (error) {
      this.logger.warn(
        'Throttle check failed, letting the request through',
        { scope, error: error instanceof Error ? error.message : String(error) },
        ThrottleGuard.name,
      );
      return true;
    }

    if (hit.count <= this.config.limit) {
      return true;
    }

    const retryAfterSeconds = Math.max(1, Math.ceil(hit.resetInMs / MS_PER_SECOND));
    http.getResponse<Response>().setHeader('Retry-After', String(retryAfterSeconds));
    throw new HttpException(
      { errorCode: RATE_LIMITED_ERROR_CODE, message: 'Too many requests, try again later' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
