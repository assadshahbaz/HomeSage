import { TestBed } from '@angular/core/testing';
import type { ChatEvent, ChatRequest } from '@api/contracts';
import { Observable } from 'rxjs';
import type { Subscriber } from 'rxjs';

import type { ChatStreamItem } from '../resources/chat/chat.resource';
import { ChatResource } from '../resources/chat/chat.resource';
import { AGGREGATE_STREAM, NO_MATCH_STREAM, PROPERTIES_STREAM } from './chat-stream.fixture';
import { ChatStore } from './chat-store';
import { ChatSession } from './session/chat-session';

const QUESTION = 'flats in Aberdeen with a garden under £250,000';
const ERROR_MESSAGE = 'Something went wrong while answering. Please try again.';
const ERROR: ChatEvent = { type: 'error', message: ERROR_MESSAGE };

/** One request the store made, with the stream the test feeds it. */
interface FakeStream {
  readonly request: ChatRequest;
  readonly send: (...items: readonly ChatStreamItem[]) => void;
  readonly unsubscribed: () => boolean;
}

/** A fake SSE feed: each `stream()` call is held open until the test sends to it. */
function fakeResource(): { resource: Pick<ChatResource, 'stream'>; streams: FakeStream[] } {
  const streams: FakeStream[] = [];
  const resource = {
    stream: (request: ChatRequest): Observable<ChatStreamItem> =>
      new Observable<ChatStreamItem>((subscriber: Subscriber<ChatStreamItem>) => {
        let unsubscribed = false;
        streams.push({
          request,
          send: (...items) => {
            for (const item of items) {
              subscriber.next(item);
            }
          },
          unsubscribed: () => unsubscribed,
        });
        return () => {
          unsubscribed = true;
        };
      }),
  };
  return { resource, streams };
}

function setUp(): { store: ChatStore; streams: FakeStream[]; session: ChatSession } {
  const { resource, streams } = fakeResource();
  TestBed.configureTestingModule({ providers: [{ provide: ChatResource, useValue: resource }] });
  return { store: TestBed.inject(ChatStore), streams, session: TestBed.inject(ChatSession) };
}

describe('ChatStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty and idle', () => {
    const { store } = setUp();

    expect(store.turns()).toEqual([]);
    expect(store.current()).toBeNull();
    expect(store.busy()).toBe(false);
    expect(store.stage()).toBeNull();
  });

  it('sends the question with the session id', () => {
    const { store, streams, session } = setUp();

    store.ask(QUESTION);

    expect(streams[0]?.request).toEqual({ question: QUESTION, sessionId: session.id() });
  });

  it('updates its state with every event of a stream, in order', () => {
    const { store, streams } = setUp();
    store.ask(QUESTION);
    const [route, retrieval, ...rest] = PROPERTIES_STREAM;
    const feed = streams[0];

    expect(store.stage()).toBe('routing');
    expect(store.busy()).toBe(true);

    feed.send(route);
    expect(store.stage()).toBe('retrieving');
    expect(store.route()).toEqual(route);

    feed.send(retrieval);
    expect(store.stage()).toBe('answering');
    expect(store.retrieval()).toEqual(retrieval);
    expect(store.retrievedProperties().length).toBe(3);

    const tokens = rest.filter((event) => event.type === 'token');
    feed.send(...tokens);
    expect(store.current()?.answer).toBe(tokens.map((event) => event.text).join(''));
    expect(store.citedIds()).toEqual([]);

    feed.send(...rest.filter((event) => event.type !== 'token'));
    expect(store.citedIds()).toEqual(['523', '663']);
    expect(store.citations()).toEqual(PROPERTIES_STREAM.at(-2));
    expect(store.stage()).toBe('done');
    expect(store.busy()).toBe(false);
  });

  it.each([
    ['an aggregate', AGGREGATE_STREAM],
    ['a no match', NO_MATCH_STREAM],
  ])('ends %s stream done, with no property cited', (_, stream) => {
    const { store, streams } = setUp();
    store.ask(QUESTION);

    streams[0].send(...stream);

    expect(store.stage()).toBe('done');
    expect(store.citedIds()).toEqual([]);
    expect(store.retrievedProperties()).toEqual([]);
  });

  it('marks a turn failed on an error mid stream, and the next question still works', () => {
    const { store, streams } = setUp();
    store.ask(QUESTION);
    streams[0].send(...PROPERTIES_STREAM.slice(0, 3), ERROR);

    expect(store.stage()).toBe('failed');
    expect(store.current()?.error).toBe(ERROR_MESSAGE);
    expect(store.busy()).toBe(false);

    store.ask('3 bed homes in Ellon');
    streams[1].send(...PROPERTIES_STREAM);

    expect(store.turns().map((turn) => turn.stage)).toEqual(['failed', 'done']);
  });

  it('cancels the streaming answer when a new question is asked', () => {
    const { store, streams } = setUp();
    store.ask(QUESTION);
    streams[0].send(PROPERTIES_STREAM[0]);

    store.ask('3 bed homes in Ellon');
    streams[0].send(...PROPERTIES_STREAM.slice(1));

    expect(streams[0].unsubscribed()).toBe(true);
    expect(store.turns().map((turn) => turn.stage)).toEqual(['cancelled', 'routing']);
    expect(store.turns()[0]?.answer).toBe('');
  });

  it('leaves an ended turn alone when the next question is asked', () => {
    const { store, streams } = setUp();
    store.ask(QUESTION);
    streams[0].send(...PROPERTIES_STREAM);

    store.ask('3 bed homes in Ellon');

    expect(store.turns()[0]?.stage).toBe('done');
  });

  it('starts a new conversation: stops the stream, clears the turns, renews the session', () => {
    const { store, streams, session } = setUp();
    const firstSession = session.id();
    store.ask(QUESTION);

    store.newConversation();

    expect(streams[0].unsubscribed()).toBe(true);
    expect(store.turns()).toEqual([]);
    expect(store.busy()).toBe(false);

    store.ask('3 bed homes in Ellon');
    expect(streams[1]?.request.sessionId).not.toBe(firstSession);
    expect(streams[1]?.request.sessionId).toBe(session.id());
  });
});
