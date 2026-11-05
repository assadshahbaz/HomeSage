import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextMiddleware } from './request-context.middleware.js';
import { RequestContextService } from './request-context.service.js';
import { REQUEST_ID_HEADER } from './request-id.js';

const SAFE_ID = 'caller-supplied-id';

function run(inbound?: unknown): {
  context: RequestContextService;
  setHeader: ReturnType<typeof vi.fn>;
  seenInsideHandler: string | undefined;
} {
  const context = new RequestContextService();
  const middleware = new RequestContextMiddleware(context);
  const setHeader = vi.fn();
  let seenInsideHandler: string | undefined;

  const request = { headers: { [REQUEST_ID_HEADER]: inbound } } as unknown as Request;
  const response = { setHeader } as unknown as Response;
  const next: NextFunction = () => {
    seenInsideHandler = context.getRequestId();
  };

  middleware.use(request, response, next);

  return { context, setHeader, seenInsideHandler };
}

describe('RequestContextMiddleware', () => {
  it('opens the context before the handler runs', () => {
    const { seenInsideHandler } = run(SAFE_ID);

    expect(seenInsideHandler).toBe(SAFE_ID);
  });

  it('echoes the id back to the caller', () => {
    const { setHeader } = run(SAFE_ID);

    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, SAFE_ID);
  });

  it('replaces an id that could forge a log line', () => {
    const { setHeader, seenInsideHandler } = run('forged\nlevel=error');

    expect(seenInsideHandler).not.toBe('forged\nlevel=error');
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, seenInsideHandler);
  });

  it('generates one when the caller sent none', () => {
    const { seenInsideHandler } = run(undefined);

    expect(seenInsideHandler).toEqual(expect.any(String));
  });

  it('answers undefined once the request is over', () => {
    const { context } = run(SAFE_ID);

    expect(context.getRequestId()).toBeUndefined();
  });
});
