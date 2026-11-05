import { Global, Module } from '@nestjs/common';
import { ThrottleCounter } from './throttle-counter.js';
import { ThrottleGuard } from './throttle.guard.js';

// Global, since `@Throttle` builds its guard inside whichever feature module
// owns the controller, and every one of them needs the counter.
@Global()
@Module({
  providers: [ThrottleCounter, ThrottleGuard],
  exports: [ThrottleCounter, ThrottleGuard],
})
export class ThrottlerModule {}
