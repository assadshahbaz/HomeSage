import { BranchTimeoutError, withinDeadline } from './branch-deadline.js';

describe('withinDeadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('settles with the work when it finishes in time', async () => {
    await expect(withinDeadline(Promise.resolve('rows'), 1000)).resolves.toBe('rows');
  });

  it('passes the work failure through unchanged', async () => {
    const error = new Error('Search is unavailable');

    await expect(withinDeadline(Promise.reject(error), 1000)).rejects.toBe(error);
  });

  it('rejects with a timeout once the deadline passes', async () => {
    vi.useFakeTimers();
    const pending = withinDeadline(new Promise(() => undefined), 15_000);
    const failure = pending.catch((thrown: unknown) => thrown);

    await vi.advanceTimersByTimeAsync(15_000);

    expect(await failure).toBeInstanceOf(BranchTimeoutError);
    expect(await failure).toMatchObject({ message: 'did not finish within 15000 ms' });
  });

  it('clears its timer when the work wins, so nothing is left pending', async () => {
    vi.useFakeTimers();

    await withinDeadline(Promise.resolve('rows'), 15_000);

    expect(vi.getTimerCount()).toBe(0);
  });
});
