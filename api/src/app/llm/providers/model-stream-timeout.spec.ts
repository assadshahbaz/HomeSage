import { GatewayTimeoutException } from '@nestjs/common';
import { streamWithinDeadline } from './model-stream-timeout.js';

const MODEL = 'answer-model';
const TIMEOUT_MS = 20;

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const seen: T[] = [];
  for await (const item of stream) {
    seen.push(item);
  }
  return seen;
}

async function* chunks(...items: string[]): AsyncGenerator<string> {
  for (const item of items) {
    await Promise.resolve();
    yield item;
  }
}

describe('streamWithinDeadline', () => {
  it('passes every chunk on when the stream finishes in time', async () => {
    await expect(
      collect(streamWithinDeadline(MODEL, TIMEOUT_MS, () => Promise.resolve(chunks('a', 'b')))),
    ).resolves.toEqual(['a', 'b']);
  });

  it('turns a stream that never opens into a 504 naming the model', async () => {
    const stream = streamWithinDeadline(
      MODEL,
      TIMEOUT_MS,
      () => new Promise<AsyncIterable<string>>(() => undefined),
    );

    await expect(collect(stream)).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  it('ends a stream that stalls mid reply at the deadline, keeping what came before', async () => {
    async function* stalls(): AsyncGenerator<string> {
      yield 'Two flats';
      await new Promise(() => undefined);
    }
    const seen: string[] = [];
    const started = Date.now();

    await expect(
      (async (): Promise<void> => {
        for await (const item of streamWithinDeadline(MODEL, TIMEOUT_MS, () =>
          Promise.resolve(stalls()),
        )) {
          seen.push(item);
        }
      })(),
    ).rejects.toThrow('Model answer-model did not answer in time');
    expect(seen).toEqual(['Two flats']);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('aborts the signal at the deadline', async () => {
    let handed: AbortSignal | undefined;

    await expect(
      collect(
        streamWithinDeadline(MODEL, TIMEOUT_MS, (signal) => {
          handed = signal;
          return new Promise<AsyncIterable<string>>(() => undefined);
        }),
      ),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
    expect(handed?.aborted).toBe(true);
  });

  it('closes the source and aborts the signal when the reader stops early', async () => {
    let closed = false;
    let handed: AbortSignal | undefined;
    async function* endless(): AsyncGenerator<string> {
      try {
        for (;;) {
          await Promise.resolve();
          yield 'more';
        }
      } finally {
        closed = true;
      }
    }

    for await (const item of streamWithinDeadline(MODEL, TIMEOUT_MS, (signal) => {
      handed = signal;
      return Promise.resolve(endless());
    })) {
      expect(item).toBe('more');
      break;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(closed).toBe(true);
    expect(handed?.aborted).toBe(true);
  });

  it('leaves the signal alone and the deadline cleared when the stream finishes', async () => {
    let handed: AbortSignal | undefined;

    await collect(
      streamWithinDeadline(MODEL, TIMEOUT_MS, (signal) => {
        handed = signal;
        return Promise.resolve(chunks('a'));
      }),
    );
    await new Promise((resolve) => {
      setTimeout(resolve, TIMEOUT_MS * 2);
    });

    expect(handed?.aborted).toBe(false);
  });

  it('passes any other failure through unchanged', async () => {
    const failure = new Error('429 rate limited');

    await expect(
      collect(streamWithinDeadline(MODEL, TIMEOUT_MS, () => Promise.reject(failure))),
    ).rejects.toBe(failure);
  });
});
