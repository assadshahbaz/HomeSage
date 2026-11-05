import { GatewayTimeoutException } from '@nestjs/common';
import { withModelTimeout } from './model-timeout.js';

const MODEL = 'answer-model';
const TIMEOUT_MS = 20;

// Settles when the signal aborts, the way an SDK's fetch does.
function hangUntilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => {
      reject(new Error('The operation was aborted'));
    });
  });
}

describe('withModelTimeout', () => {
  it('returns what the call returns when it answers in time', async () => {
    await expect(
      withModelTimeout(MODEL, TIMEOUT_MS, () => Promise.resolve('SELECT 1')),
    ).resolves.toBe('SELECT 1');
  });

  it('turns a call that outlives the timeout into a 504 naming the model, keeping the cause', async () => {
    const call = withModelTimeout(MODEL, TIMEOUT_MS, hangUntilAborted);

    await expect(call).rejects.toBeInstanceOf(GatewayTimeoutException);
    await expect(call).rejects.toThrow('Model answer-model did not answer in time');
    await expect(call).rejects.toHaveProperty('cause.message', 'The operation was aborted');
  });

  it('ends the wait at the deadline when the call ignores the signal', async () => {
    // An SDK sleeping through a long retry-after header, deaf to the abort.
    const sleepsThroughAbort = new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve('too late');
      }, 60_000).unref();
    });
    const started = Date.now();

    const call = withModelTimeout(MODEL, TIMEOUT_MS, () => sleepsThroughAbort);

    await expect(call).rejects.toBeInstanceOf(GatewayTimeoutException);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('aborts the signal it handed the call at the deadline', async () => {
    let handed: AbortSignal | undefined;

    await expect(
      withModelTimeout(MODEL, TIMEOUT_MS, (signal) => {
        handed = signal;
        return hangUntilAborted(signal);
      }),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
    expect(handed?.aborted).toBe(true);
  });

  it('leaves the signal alone and the deadline cleared when the call answers in time', async () => {
    let handed: AbortSignal | undefined;

    await withModelTimeout(MODEL, TIMEOUT_MS, (signal) => {
      handed = signal;
      return Promise.resolve('SELECT 1');
    });
    await new Promise((resolve) => {
      setTimeout(resolve, TIMEOUT_MS * 2);
    });

    expect(handed?.aborted).toBe(false);
  });

  it('passes any other failure through unchanged', async () => {
    const failure = new Error('429 rate limited');

    await expect(withModelTimeout(MODEL, TIMEOUT_MS, () => Promise.reject(failure))).rejects.toBe(
      failure,
    );
  });
});
