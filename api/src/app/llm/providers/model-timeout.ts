import { GatewayTimeoutException } from '@nestjs/common';

/**
 * Runs one provider call under a deadline of its own, covering every retry the
 * SDK makes, and turns a missed deadline into a 504. The call gets a signal
 * that aborts at the deadline, but the wait does not rely on it: an SDK may
 * sleep through a long `retry-after` without watching the signal, so the
 * deadline ends the wait itself and the call is left to settle on its own.
 * The timeout is recognised by whether the signal fired rather than by the
 * shape of the error the SDK raises when its fetch aborts, which differs
 * between vendors.
 */
export async function withModelTimeout<T>(
  model: string,
  timeoutMs: number,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const pending = call(controller.signal);
  let timer: NodeJS.Timeout | undefined;
  // Never settles when the call wins, so nothing is left to reject unhandled.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`No answer within ${String(timeoutMs)} ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([pending, deadline]);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new GatewayTimeoutException(`Model ${model} did not answer in time`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
