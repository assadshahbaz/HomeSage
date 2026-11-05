import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { SseStream } from './sse-stream.js';

const HEARTBEAT_MS = 15_000;

class FakeResponse extends EventEmitter {
  public readonly headers = new Map<string, string>();
  public readonly written: string[] = [];
  public statusCode = 0;
  public flushed = false;
  public ended = 0;

  public status(code: number): this {
    this.statusCode = code;
    return this;
  }

  public setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  public flushHeaders(): void {
    this.flushed = true;
  }

  public write(frame: string): void {
    this.written.push(frame);
  }

  public end(): void {
    this.ended += 1;
  }
}

function open(): { stream: SseStream; response: FakeResponse } {
  const response = new FakeResponse();
  const stream = new SseStream(response as unknown as Response, HEARTBEAT_MS);
  return { stream, response };
}

describe('SseStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens with the event stream headers, flushed at once', () => {
    const { response } = open();

    expect(response.statusCode).toBe(200);
    expect(Object.fromEntries(response.headers)).toEqual({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    expect(response.flushed).toBe(true);
  });

  it('frames an event as its type and the whole event as JSON', () => {
    const { stream, response } = open();

    stream.send({ type: 'token', text: 'Two flats match [P-496]' });

    expect(response.written).toEqual([
      'event: token\ndata: {"type":"token","text":"Two flats match [P-496]"}\n\n',
    ]);
  });

  it('sends a heartbeat comment every interval while open', () => {
    const { response } = open();

    vi.advanceTimersByTime(HEARTBEAT_MS * 2);

    expect(response.written).toEqual([': heartbeat\n\n', ': heartbeat\n\n']);
  });

  it('writes nothing more once ended, and ends the response once', () => {
    const { stream, response } = open();

    stream.end();
    stream.send({ type: 'done' });
    stream.end();
    vi.advanceTimersByTime(HEARTBEAT_MS * 2);

    expect(response.written).toEqual([]);
    expect(response.ended).toBe(1);
    expect(stream.isOpen).toBe(false);
  });

  it('stops when the client goes away, without ending the closed response', () => {
    const { stream, response } = open();

    response.emit('close');
    stream.send({ type: 'done' });
    stream.end();
    vi.advanceTimersByTime(HEARTBEAT_MS * 2);

    expect(stream.isOpen).toBe(false);
    expect(response.written).toEqual([]);
    expect(response.ended).toBe(0);
  });
});
