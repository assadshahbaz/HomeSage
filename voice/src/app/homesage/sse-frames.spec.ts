import { readSseFrames } from './sse-frames.js';
import type { SseFrame } from './sse-frames.js';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>): Promise<SseFrame[]> {
  const frames: SseFrame[] = [];
  for await (const frame of readSseFrames(body)) {
    frames.push(frame);
  }
  return frames;
}

describe('readSseFrames', () => {
  it('reads named events and skips heartbeats', async () => {
    const frames = await collect(
      streamOf(': heartbeat\n\n', 'event: token\ndata: {"a":1}\n\n', 'event: done\ndata: {}\n\n'),
    );
    expect(frames).toEqual([
      { event: 'token', data: '{"a":1}' },
      { event: 'done', data: '{}' },
    ]);
  });

  it('joins a frame split across chunks, including inside a multi byte character', async () => {
    const pound = new TextEncoder().encode('£');
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: token\ndata: "'));
        controller.enqueue(pound.slice(0, 1));
        controller.enqueue(pound.slice(1));
        controller.enqueue(encoder.encode('250"\n'));
        controller.enqueue(encoder.encode('\n'));
        controller.close();
      },
    });
    expect(await collect(body)).toEqual([{ event: 'token', data: '"£250"' }]);
  });

  it('handles CRLF line endings, multi line data and a frame with no event name', async () => {
    const frames = await collect(streamOf('data: one\r\ndata: two\r\n\r\n'));
    expect(frames).toEqual([{ event: 'message', data: 'one\ntwo' }]);
  });

  it('yields a last frame that has no blank line after it', async () => {
    expect(await collect(streamOf('event: done\ndata: {}'))).toEqual([
      { event: 'done', data: '{}' },
    ]);
  });
});
