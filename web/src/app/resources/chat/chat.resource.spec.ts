import { TestBed } from '@angular/core/testing';
import type { ChatEvent, ChatRequest } from '@api/contracts';
import type { Observable } from 'rxjs';
import { firstValueFrom, toArray } from 'rxjs';

import { AGGREGATE_STREAM, PROPERTIES_STREAM } from '../../chat/chat-stream.fixture';
import { provideRuntimeConfig } from '../../runtime-config/runtime-config';
import type { SseBodyEnd } from './chat-stream.sse';
import { sseBody, toSseText } from './chat-stream.sse';
import type { ChatStreamItem } from './chat.resource';
import { ChatResource } from './chat.resource';
import type { ChatStreamFailureReason } from './chat-stream-failure';
import { CHAT_STREAM_FAILURE_REASON } from './chat-stream-failure';

const API_BASE_URL = 'https://api.example.test';
const REQUEST: ChatRequest = {
  question: 'flats in Aberdeen with a garden under £250,000',
  sessionId: '2f1c9a4e-8b7d-4c3a-9e6f-1a2b3c4d5e6f',
};
const SSE_HEADERS = { 'Content-Type': 'text/event-stream; charset=utf-8' };
const TOKEN: ChatEvent = { type: 'token', text: 'Two flats stand out.' };

function stubFetch(response: Response | Error): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchFn = vi.fn<typeof fetch>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fetchFn);
  return fetchFn;
}

/** Stubs a 200 SSE response with this text, read `chunkBytes` at a time. */
function serve(
  text: string,
  chunkBytes = Number.MAX_SAFE_INTEGER,
  end: SseBodyEnd = 'close',
): { fetchFn: ReturnType<typeof stubFetch>; cancelled: () => boolean } {
  const { body, cancelled } = sseBody(text, chunkBytes, end);
  const fetchFn = stubFetch(new Response(body, { status: 200, headers: SSE_HEADERS }));
  return { fetchFn, cancelled };
}

function stream(): Observable<ChatStreamItem> {
  return TestBed.inject(ChatResource).stream(REQUEST);
}

const collect = (items: Observable<ChatStreamItem>): Promise<ChatStreamItem[]> =>
  firstValueFrom(items.pipe(toArray()));

const failureReason = (item: ChatStreamItem | undefined): ChatStreamFailureReason | undefined =>
  item?.type === 'failure' ? item.failure.reason : undefined;

describe('ChatResource', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRuntimeConfig({ apiBaseUrl: API_BASE_URL })],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the request as JSON to the configured API, asking for an event stream', async () => {
    const { fetchFn } = serve(toSseText(PROPERTIES_STREAM));

    await collect(stream());

    expect(fetchFn).toHaveBeenCalledWith(
      `${API_BASE_URL}/chat`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(REQUEST),
      }),
    );
  });

  it('sends nothing until subscribed', () => {
    const { fetchFn } = serve(toSseText(PROPERTIES_STREAM));

    stream();

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ['the properties stream', PROPERTIES_STREAM],
    ['the aggregate stream', AGGREGATE_STREAM],
  ])('streams %s read one byte at a time, unchanged', async (_label, events) => {
    serve(toSseText(events), 1);

    await expect(collect(stream())).resolves.toEqual(events);
  });

  it('ignores heartbeats between events', async () => {
    serve(`: heartbeat\n\n${toSseText([TOKEN])}: heartbeat\n\n${toSseText([{ type: 'done' }])}`);

    await expect(collect(stream())).resolves.toEqual([TOKEN, { type: 'done' }]);
  });

  it('ends at an error event, reads nothing after it and releases the body', async () => {
    const error: ChatEvent = { type: 'error', message: 'Something went wrong.' };
    const { cancelled } = serve(toSseText([TOKEN, error, TOKEN]), 1, 'hang');

    await expect(collect(stream())).resolves.toEqual([TOKEN, error]);
    expect(cancelled()).toBe(true);
  });

  it('ends at done even if the connection stays open', async () => {
    const { cancelled } = serve(toSseText([TOKEN, { type: 'done' }]), 1, 'hang');

    await expect(collect(stream())).resolves.toEqual([TOKEN, { type: 'done' }]);
    expect(cancelled()).toBe(true);
  });

  it.each([
    ['not JSON', 'data: {"type":"token",\n\n'],
    ['an unknown type', 'data: {"type":"thinking"}\n\n'],
    ['an empty token', 'data: {"type":"token","text":""}\n\n'],
  ])(
    'fails as malformed on a frame that is %s, after the events before it',
    async (_label, bad) => {
      serve(`${toSseText([TOKEN])}${bad}${toSseText([{ type: 'done' }])}`);

      const items = await collect(stream());

      expect(items).toHaveLength(2);
      expect(items[0]).toEqual(TOKEN);
      expect(failureReason(items[1])).toBe(CHAT_STREAM_FAILURE_REASON.MALFORMED);
    },
  );

  it('fails as malformed on a frame that never ends', async () => {
    serve(`data: "${'x'.repeat(300_000)}`, 16_384, 'hang');

    const items = await collect(stream());

    expect(items.map(failureReason)).toEqual([CHAT_STREAM_FAILURE_REASON.MALFORMED]);
  });

  it('fails as ended early when the body closes without done or error', async () => {
    serve(toSseText(PROPERTIES_STREAM.slice(0, 3)));

    const items = await collect(stream());

    expect(items.slice(0, 3)).toEqual(PROPERTIES_STREAM.slice(0, 3));
    expect(items.slice(3).map(failureReason)).toEqual([CHAT_STREAM_FAILURE_REASON.ENDED_EARLY]);
  });

  it.each([
    [400, {}, CHAT_STREAM_FAILURE_REASON.REJECTED],
    [503, {}, CHAT_STREAM_FAILURE_REASON.UNAVAILABLE],
    [500, {}, CHAT_STREAM_FAILURE_REASON.UNAVAILABLE],
    [200, { 'Content-Type': 'application/json' }, CHAT_STREAM_FAILURE_REASON.MALFORMED],
  ])('maps a %i response to %s', async (status, headers, reason) => {
    stubFetch(new Response('{"message":"internal detail"}', { status, headers }));

    const items = await collect(stream());

    expect(items.map(failureReason)).toEqual([reason]);
  });

  it.each([
    ['7', 7],
    [' 0 ', 0],
    [null, null],
    ['Wed, 21 Oct 2026 07:28:00 GMT', null],
    ['-3', null],
  ])('reads Retry-After %j on a 429 as %j seconds', async (header, seconds) => {
    const headers = header === null ? undefined : { 'Retry-After': header };
    stubFetch(new Response('', { status: 429, headers }));

    const [item] = await collect(stream());

    expect(item).toEqual({
      type: 'failure',
      failure: expect.objectContaining({
        reason: CHAT_STREAM_FAILURE_REASON.RATE_LIMITED,
        retryAfterSeconds: seconds,
      }),
    });
  });

  it('fails as network when the request cannot be sent', async () => {
    stubFetch(new TypeError('Failed to fetch'));

    const items = await collect(stream());

    expect(items.map(failureReason)).toEqual([CHAT_STREAM_FAILURE_REASON.NETWORK]);
  });

  it('fails as network when the connection drops mid answer', async () => {
    serve(toSseText([TOKEN]), Number.MAX_SAFE_INTEGER, 'fail');

    const items = await collect(stream());

    expect(items[0]).toEqual(TOKEN);
    expect(items.slice(1).map(failureReason)).toEqual([CHAT_STREAM_FAILURE_REASON.NETWORK]);
  });

  it('aborts the request and releases the body on unsubscribe, reporting no failure', async () => {
    const { fetchFn, cancelled } = serve(toSseText([TOKEN]), 1, 'hang');
    const items: ChatStreamItem[] = [];
    let completed = false;

    const subscription = stream().subscribe({
      next: (item) => items.push(item),
      complete: () => {
        completed = true;
      },
    });
    await vi.waitFor(() => {
      expect(items).toEqual([TOKEN]);
    });
    subscription.unsubscribe();

    const signal = fetchFn.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(true);
    await vi.waitFor(() => {
      expect(cancelled()).toBe(true);
    });
    expect(items).toEqual([TOKEN]);
    expect(completed).toBe(false);
  });

  it('gives every failure a message to show that carries no status or server text', async () => {
    const responses = [400, 429, 500, 503].map(
      (status) => new Response('internal detail', { status }),
    );
    const messages: string[] = [];

    for (const response of responses) {
      stubFetch(response);
      const [item] = await collect(stream());
      if (item.type === 'failure') {
        messages.push(item.failure.message);
      }
    }
    stubFetch(new TypeError('Failed to fetch'));
    const [networkItem] = await collect(stream());
    if (networkItem.type === 'failure') {
      messages.push(networkItem.failure.message);
    }

    expect(messages).toHaveLength(5);
    for (const message of messages) {
      expect(message).not.toBe('');
      expect(message).not.toMatch(/\d{3}|internal detail|fetch/i);
    }
  });
});
