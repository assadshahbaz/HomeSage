import { describe, expect, it } from 'vitest';
import { RequestContextService } from './request-context.service.js';

const FIRST = 'request-one';
const SECOND = 'request-two';

describe('RequestContextService', () => {
  it('reads the id of the request it is running under', () => {
    const context = new RequestContextService();

    expect(context.run({ requestId: FIRST }, () => context.getRequestId())).toBe(FIRST);
  });

  it('answers undefined outside a request rather than throwing', () => {
    const context = new RequestContextService();

    expect(context.getRequestId()).toBeUndefined();
  });

  it('survives an await inside the request', async () => {
    const context = new RequestContextService();

    const seen = await context.run({ requestId: FIRST }, async () => {
      await Promise.resolve();
      return context.getRequestId();
    });

    expect(seen).toBe(FIRST);
  });

  it('keeps two overlapping requests apart', async () => {
    const context = new RequestContextService();
    const slower = context.run({ requestId: FIRST }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return context.getRequestId();
    });
    const faster = context.run({ requestId: SECOND }, () =>
      Promise.resolve(context.getRequestId()),
    );

    expect(await Promise.all([slower, faster])).toEqual([FIRST, SECOND]);
  });

  it('keeps the id inside a listener registered during the request', async () => {
    const context = new RequestContextService();

    const seen = await context.run(
      { requestId: FIRST },
      () =>
        new Promise((resolve) =>
          setImmediate(() => {
            resolve(context.getRequestId());
          }),
        ),
    );

    expect(seen).toBe(FIRST);
  });
});
