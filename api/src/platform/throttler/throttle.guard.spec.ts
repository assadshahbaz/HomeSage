import { HttpException, HttpStatus } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import type { AppLogger } from '../logging/app-logger.js';
import type { ThrottleCounter, ThrottleHit } from './throttle-counter.js';
import { ThrottleGuard } from './throttle.guard.js';

const LIMIT = 3;
const WINDOW_MS = 60000;
const CALLER_IP = '203.0.113.7';

function build(options: { scope?: string; hit?: Promise<ThrottleHit>; ip?: string }): {
  guard: ThrottleGuard;
  context: ExecutionContext;
  hitFn: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
} {
  const hitFn = vi.fn(() => options.hit ?? Promise.resolve({ count: 1, resetInMs: WINDOW_MS }));
  const setHeader = vi.fn();
  const warn = vi.fn();
  const reflector = { getAllAndOverride: vi.fn(() => options.scope) } as unknown as Reflector;
  const configService = {
    getOrThrow: () => ({ limit: LIMIT, windowMs: WINDOW_MS }),
  } as unknown as ConfigService;
  const guard = new ThrottleGuard(
    { hit: hitFn } as unknown as ThrottleCounter,
    reflector,
    { warn } as unknown as AppLogger,
    configService,
  );
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ ip: 'ip' in options ? options.ip : CALLER_IP }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { guard, context, hitFn, setHeader, warn };
}

describe('ThrottleGuard', () => {
  it('counts the request against the scope and the caller IP for one window', async () => {
    const { guard, context, hitFn } = build({ scope: 'sql' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hitFn).toHaveBeenCalledWith('sql', CALLER_IP, WINDOW_MS);
  });

  it.each([1, LIMIT])('lets request number %i through', async (count) => {
    const { guard, context, setHeader } = build({
      scope: 'sql',
      hit: Promise.resolve({ count, resetInMs: 1000 }),
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('refuses the request after the limit with 429, an error code and Retry-After', async () => {
    const { guard, context, setHeader } = build({
      scope: 'sql',
      hit: Promise.resolve({ count: LIMIT + 1, resetInMs: 41_200 }),
    });

    const error = await guard.canActivate(context).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((error as HttpException).getResponse()).toEqual({
      errorCode: 'E_RATE_LIMITED',
      message: 'Too many requests, try again later',
    });
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '42');
  });

  it('never tells a caller to retry after zero seconds', async () => {
    const { guard, context, setHeader } = build({
      scope: 'sql',
      hit: Promise.resolve({ count: LIMIT + 1, resetInMs: 0 }),
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(HttpException);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '1');
  });

  it('fails open when Redis cannot be reached, and says so in the log', async () => {
    const { guard, context, warn } = build({
      scope: 'sql',
      hit: Promise.reject(new Error('Command timed out')),
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(warn).toHaveBeenCalledWith(
      'Throttle check failed, letting the request through',
      { scope: 'sql', error: 'Command timed out' },
      'ThrottleGuard',
    );
  });

  it('counts a caller with no readable address in one shared bucket', async () => {
    const { guard, context, hitFn } = build({ scope: 'sql', ip: undefined });

    await guard.canActivate(context);

    expect(hitFn).toHaveBeenCalledWith('sql', 'unknown', WINDOW_MS);
  });

  it('leaves an endpoint without a scope alone', async () => {
    const { guard, context, hitFn } = build({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hitFn).not.toHaveBeenCalled();
  });
});
