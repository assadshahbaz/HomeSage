import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { ThrottleGuard } from './throttle.guard.js';
import { THROTTLE_SCOPE } from './throttle-scope.js';

/**
 * Rate limits a handler or controller per caller IP. `scope` names the
 * counters, so two endpoints never share one limit.
 */
export const Throttle = (scope: string): ReturnType<typeof applyDecorators> =>
  applyDecorators(SetMetadata(THROTTLE_SCOPE, scope), UseGuards(ThrottleGuard));
