import type { Redis } from 'ioredis';
import { ThrottleCounter } from './throttle-counter.js';

function counterReplying(reply: unknown): {
  counter: ThrottleCounter;
  evalFn: ReturnType<typeof vi.fn>;
} {
  const evalFn = vi.fn().mockResolvedValue(reply);
  return { counter: new ThrottleCounter({ eval: evalFn } as unknown as Redis), evalFn };
}

describe('ThrottleCounter', () => {
  it('counts a hit on one key per scope and caller, passing the window to the script', async () => {
    const { counter, evalFn } = counterReplying([4, 12_000]);

    await expect(counter.hit('sql', '203.0.113.7', 60_000)).resolves.toEqual({
      count: 4,
      resetInMs: 12_000,
    });
    expect(evalFn).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR', KEYS[1])"),
      1,
      'homesage:throttle:sql:203.0.113.7',
      '60000',
    );
  });

  it.each([
    ['a reply that is not a pair', 'OK'],
    ['a count of zero', [0, 1000]],
    ['a negative time left', [1, -1]],
  ])('refuses %s rather than guessing', async (_, reply) => {
    await expect(counterReplying(reply).counter.hit('sql', 'ip', 60_000)).rejects.toThrow();
  });

  it('lets a Redis failure through for the guard to decide on', async () => {
    const failure = new Error('Command timed out');
    const evalFn = vi.fn().mockRejectedValue(failure);

    await expect(
      new ThrottleCounter({ eval: evalFn } as unknown as Redis).hit('sql', 'ip', 1),
    ).rejects.toBe(failure);
  });
});
