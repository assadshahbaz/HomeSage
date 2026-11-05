import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import type { ChatEvent } from '../../../contracts/index.js';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  // `no-transform` stops a proxy compressing the stream, which would buffer it.
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // Tells nginx style proxies not to buffer the response.
  'X-Accel-Buffering': 'no',
} as const;

const HEARTBEAT = ': heartbeat\n\n';

/**
 * A server sent events response: opens it at once, frames each chat event as
 * an `event:` line naming its type and a `data:` line holding the event as
 * JSON, and sends a comment line every `heartbeatMs` so a proxy never closes
 * an answer that is slow to start. Once the client goes away or the stream is
 * ended, nothing more is written.
 */
export class SseStream {
  private open = true;
  private readonly heartbeat: NodeJS.Timeout;

  public constructor(
    private readonly response: Response,
    heartbeatMs: number,
  ) {
    response.status(HttpStatus.OK);
    for (const [name, value] of Object.entries(SSE_HEADERS)) {
      response.setHeader(name, value);
    }
    response.flushHeaders();
    this.heartbeat = setInterval(() => {
      this.write(HEARTBEAT);
    }, heartbeatMs);
    response.on('close', () => {
      this.stop();
    });
  }

  /** False once the client has gone or the stream has ended. */
  public get isOpen(): boolean {
    return this.open;
  }

  /** Sends one event, unless the stream is no longer open. */
  public send(event: ChatEvent): void {
    this.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  /** Ends the response. Safe to call more than once. */
  public end(): void {
    if (this.open) {
      this.stop();
      this.response.end();
    }
  }

  private write(frame: string): void {
    if (this.open) {
      this.response.write(frame);
    }
  }

  private stop(): void {
    this.open = false;
    clearInterval(this.heartbeat);
  }
}
