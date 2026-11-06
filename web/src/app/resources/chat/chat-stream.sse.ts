import type { ChatEvent } from '@api/contracts';

/** Writes events the way the API frames them: `event:` names the type, `data:` holds the event. */
export function toSseText(events: readonly ChatEvent[]): string {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

/** How a fake body ends once every chunk has been read. */
export type SseBodyEnd = 'close' | 'hang' | 'fail';

/** A response body for specs, and whether its reader cancelled it. */
export interface SseBody {
  readonly body: ReadableStream<Uint8Array>;
  readonly cancelled: () => boolean;
}

/**
 * Serves text as a body cut into chunks of `chunkBytes` bytes, so frames and
 * multibyte characters split across reads. After the last chunk it closes,
 * hangs like an open connection, or fails like a dropped one.
 */
export function sseBody(text: string, chunkBytes: number, end: SseBodyEnd = 'close'): SseBody {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  let cancelled = false;

  const body = new ReadableStream<Uint8Array>({
    pull: (controller) => {
      if (offset < bytes.length) {
        controller.enqueue(bytes.slice(offset, offset + chunkBytes));
        offset += chunkBytes;
      } else if (end === 'close') {
        controller.close();
      } else if (end === 'fail') {
        controller.error(new TypeError('network error'));
      }
      // 'hang' enqueues nothing more, so the next read waits until cancelled.
    },
    cancel: () => {
      cancelled = true;
    },
  });

  return { body, cancelled: () => cancelled };
}
