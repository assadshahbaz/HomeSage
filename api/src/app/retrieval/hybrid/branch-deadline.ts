/** A retrieval branch that did not finish within its deadline. */
export class BranchTimeoutError extends Error {
  public constructor(timeoutMs: number) {
    super(`did not finish within ${String(timeoutMs)} ms`);
    this.name = BranchTimeoutError.name;
  }
}

/**
 * Settles with `work`, or rejects with `BranchTimeoutError` once `timeoutMs`
 * has passed. The work itself is not stopped: its result is only no longer
 * waited for, so one slow branch cannot hold back the ones that finished.
 */
export async function withinDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new BranchTimeoutError(timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
