import { GatewayTimeoutException } from '@nestjs/common';

/**
 * Opens a provider stream and passes its chunks on under one deadline that
 * covers opening it and every chunk after, and turns a missed deadline into a
 * 504 the way `withModelTimeout` does. Each read is raced against the
 * deadline rather than trusting the SDK to watch the signal, so a stream that
 * stalls mid reply still ends on time. Stopping early, or timing out, aborts
 * the signal and closes the source without waiting on it.
 */
export async function* streamWithinDeadline<T>(
  model: string,
  timeoutMs: number,
  open: (signal: AbortSignal) => Promise<AsyncIterable<T>>,
): AsyncGenerator<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`No answer within ${String(timeoutMs)} ms`));
    }, timeoutMs);
  });
  // The deadline may fire between reads, when nothing is waiting on it yet.
  deadline.catch(() => undefined);

  let iterator: AsyncIterator<T> | undefined;
  let finished = false;
  try {
    const source = await Promise.race([open(controller.signal), deadline]);
    iterator = source[Symbol.asyncIterator]();
    for (;;) {
      const next = await Promise.race([iterator.next(), deadline]);
      if (next.done === true) {
        finished = true;
        return;
      }
      yield next.value;
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new GatewayTimeoutException(`Model ${model} did not answer in time`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (!finished) {
      controller.abort();
      // Not awaited: a source stuck in a read would hold the caller here.
      iterator?.return?.().catch(() => undefined);
    }
  }
}
