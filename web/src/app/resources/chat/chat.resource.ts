import { inject, Injectable } from '@angular/core';
import type { ChatEvent, ChatRequest } from '@api/contracts';
import { chatEventSchema } from '@api/contracts';
import { Observable } from 'rxjs';

import { RUNTIME_CONFIG } from '../../runtime-config/runtime-config';
import type { ChatStreamFailure } from './chat-stream-failure';
import {
  CHAT_STREAM_FAILURE_REASON,
  chatStreamFailure,
  failureForResponse,
} from './chat-stream-failure';
import { SseFrameParser } from './sse-frame-parser';

const CHAT_PATH = '/chat';
const EVENT_STREAM_TYPE = 'text/event-stream';

/** Ends a stream the client could not read. Always the last item. */
export interface ChatStreamFailureItem {
  readonly type: 'failure';
  readonly failure: ChatStreamFailure;
}

/** One item of an answer: an event from the API, or the client's own failure. */
export type ChatStreamItem = ChatEvent | ChatStreamFailureItem;

/**
 * The only code that talks to `POST /chat`. Streams the answer as typed events,
 * each parsed with the API contract, and ends after the first `done` or
 * `error`. The observable never errors: anything the client cannot read
 * arrives as one `failure` item, then it completes. It is cold, and
 * unsubscribing aborts the request, which is never reported as a failure.
 */
@Injectable({ providedIn: 'root' })
export class ChatResource {
  private readonly config = inject(RUNTIME_CONFIG);

  /** Asks one question. Nothing is sent until the result is subscribed to. */
  public stream(request: ChatRequest): Observable<ChatStreamItem> {
    return new Observable<ChatStreamItem>((subscriber) => {
      const controller = new AbortController();
      // After unsubscribing, the subscriber drops anything the aborted read still emits.
      const emit = (item: ChatStreamItem): void => {
        subscriber.next(item);
      };
      void this.read(request, controller.signal, emit).then(() => {
        subscriber.complete();
      });
      return () => {
        controller.abort();
      };
    });
  }

  private async read(
    request: ChatRequest,
    signal: AbortSignal,
    emit: (item: ChatStreamItem) => void,
  ): Promise<void> {
    const fail = (failure: ChatStreamFailure): void => {
      emit({ type: 'failure', failure });
    };

    let response: Response;
    try {
      response = await fetch(`${this.config.apiBaseUrl}${CHAT_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: EVENT_STREAM_TYPE },
        body: JSON.stringify(request),
        signal,
      });
    } catch {
      fail(chatStreamFailure(CHAT_STREAM_FAILURE_REASON.NETWORK));
      return;
    }

    if (!response.ok) {
      discard(response.body);
      fail(failureForResponse(response));
      return;
    }
    if (!isEventStream(response) || !response.body) {
      discard(response.body);
      fail(chatStreamFailure(CHAT_STREAM_FAILURE_REASON.MALFORMED));
      return;
    }

    const reader = response.body.getReader();
    // A real abort errors the body; cancelling as well releases a stream that never would.
    const cancel = (): void => {
      reader.cancel().catch(() => undefined);
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      await readEvents(reader, emit, fail);
    } catch {
      fail(chatStreamFailure(CHAT_STREAM_FAILURE_REASON.NETWORK));
    } finally {
      signal.removeEventListener('abort', cancel);
      cancel();
    }
  }
}

/** Reads frames until the first `done` or `error`, or a failure. */
async function readEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  emit: (item: ChatStreamItem) => void,
  fail: (failure: ChatStreamFailure) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  const parser = new SseFrameParser();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      fail(chatStreamFailure(CHAT_STREAM_FAILURE_REASON.ENDED_EARLY));
      return;
    }

    // `stream: true` holds back a multibyte character split across chunks.
    const { payloads, overflow } = parser.push(decoder.decode(value, { stream: true }));
    for (const payload of payloads) {
      const event = parseEvent(payload);
      if (!event) {
        fail(chatStreamFailure(CHAT_STREAM_FAILURE_REASON.MALFORMED));
        return;
      }
      emit(event);
      if (event.type === 'done' || event.type === 'error') {
        return;
      }
    }
    if (overflow) {
      fail(chatStreamFailure(CHAT_STREAM_FAILURE_REASON.MALFORMED));
      return;
    }
  }
}

/** One frame's data as an event, or null when it is not JSON or not a valid event. */
function parseEvent(payload: string): ChatEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return null;
  }
  const result = chatEventSchema.safeParse(json);
  return result.success ? result.data : null;
}

function isEventStream(response: Response): boolean {
  const mediaType = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  return mediaType === EVENT_STREAM_TYPE;
}

// An unread body would hold the connection open.
function discard(body: ReadableStream<Uint8Array> | null): void {
  body?.cancel().catch(() => undefined);
}
