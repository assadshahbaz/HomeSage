import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.ts';
import { CHAT_ERROR_MESSAGE } from '../src/app/chat/chat.controller.ts';
import { EMBEDDING_PROVIDER } from '../src/app/embeddings/embedding.symbol.ts';
import {
  noMatchMessage,
  SEARCH_FAILED_MESSAGE,
} from '../src/app/chat/no-results/no-results-message.ts';
import { LLM_JOB } from '../src/app/llm/llm-job.ts';
import type { LlmCall } from '../src/app/llm/llm.service.ts';
import { LlmService } from '../src/app/llm/llm.service.ts';
import { ROUTER_DECLINE_MESSAGE } from '../src/app/router/router-decline.ts';
import { chatEventSchema, searchFiltersSchema } from '../src/contracts/index.ts';
import type { ChatEvent } from '../src/contracts/index.ts';
import type { EmbeddingProvider, EmbeddingRequest } from '../src/core/embedding-provider.ts';
import type { LlmCompletion, LlmStreamEvent } from '../src/core/llm-provider.ts';
import { AllExceptionsFilter } from '../src/platform/filters/all-exceptions.filter.ts';
import { AppLogger } from '../src/platform/logging/app-logger.ts';
import { RequestContextService } from '../src/platform/request-context/request-context.service.ts';
import { clearThrottleCounters } from './throttle-counters.ts';

const SESSION_ID = '2f1c9a4e-8b7d-4c3a-9e6f-1a2b3c4d5e6f';
const QUESTION = '3 bed homes in Ellon';
const ROWS_SQL =
  "SELECT p.id, p.full_address, p.price FROM properties p WHERE p.town = 'Ellon' AND p.bedrooms = 3 ORDER BY p.price";
const COUNT_SQL = "SELECT COUNT(*) AS listings FROM properties p WHERE p.town = 'Stonehaven'";
// Far above any id in the data, so it can never have been retrieved.
const INVENTED_ID = '999999';

// Every query lands on one fixed unit vector: which listings come back does
// not matter here, only that the searches run against the real index.
const DIMENSIONS = Number(process.env['EMBED_DIMENSIONS']);
const stubEmbeddings: EmbeddingProvider = {
  embedDocuments: () => Promise.reject(new Error('not used')),
  embedQueries: (embedding: EmbeddingRequest) =>
    Promise.resolve({
      vectors: embedding.texts.map(() => [1, ...new Array<number>(DIMENSIONS - 1).fill(0)]),
      inputTokens: 1,
    }),
  retryAfterMs: () => null,
};

function completion(text: string): LlmCompletion {
  return { text, model: 'model', inputTokens: 1, outputTokens: 1, stopReason: 'stop' };
}

function routerReply(intent: string, filters: Record<string, unknown> = {}): string {
  return JSON.stringify({
    intent,
    filters,
    semanticQuery: intent === 'structured' ? '' : 'a family home',
    standaloneQuestion: QUESTION,
    propertyIds: [],
  });
}

/**
 * `POST /chat` against the Docker MySQL, Elasticsearch and Redis, with the
 * model mocked: the router and SQL replies and the answer stream are set per
 * test, and everything between them (validation, retrieval, the guard, the
 * SSE framing) is real. Needs the data seeded and the index built.
 */
describe('POST /chat', () => {
  let app: INestApplication;
  const complete = vi.fn<(call: LlmCall) => Promise<LlmCompletion>>();
  const stream = vi.fn<(call: LlmCall) => AsyncGenerator<LlmStreamEvent>>();

  function modelAnswers(router: string, sql: string, answer: readonly string[]): void {
    complete.mockImplementation((call) =>
      Promise.resolve(completion(call.job === LLM_JOB.ROUTER ? router : sql)),
    );
    stream.mockImplementation(async function* () {
      for (const text of answer) {
        await Promise.resolve();
        yield { kind: 'text', text };
      }
      yield { kind: 'end', completion: completion(answer.join('')) };
    });
  }

  function ask(body: object): request.Test {
    return request(app.getHttpServer()).post('/chat').send(body);
  }

  /** Every `data:` frame of a stream, each parsed with the contract. */
  function eventsOf(response: request.Response): ChatEvent[] {
    return response.text
      .split('\n\n')
      .flatMap((frame) => frame.split('\n').filter((line) => line.startsWith('data: ')))
      .map((line) => chatEventSchema.parse(JSON.parse(line.slice('data: '.length))));
  }

  function typesOf(events: readonly ChatEvent[]): string[] {
    return [...new Set(events.map((event) => event.type))];
  }

  function tokens(events: readonly ChatEvent[]): string {
    return events.map((event) => (event.type === 'token' ? event.text : '')).join('');
  }

  beforeAll(async () => {
    process.env['THROTTLE_LIMIT'] = '1000';
    const testingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LlmService)
      .useValue({ complete, stream })
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue(stubEmbeddings)
      .compile();
    app = testingModule.createNestApplication();
    const logger = app.get(AppLogger);
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(logger, level).mockImplementation(() => undefined);
    }
    app.useGlobalFilters(new AllExceptionsFilter(logger, app.get(RequestContextService)));
    await app.init();
    await clearThrottleCounters(app);
  });

  afterEach(() => {
    complete.mockReset();
    stream.mockReset();
  });

  afterAll(async () => {
    await app.close();
    delete process.env['THROTTLE_LIMIT'];
  });

  it('opens an event stream', async () => {
    modelAnswers(routerReply('structured', { towns: ['Ellon'] }), ROWS_SQL, ['None match.']);

    const response = await ask({ question: QUESTION, sessionId: SESSION_ID });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(response.headers['cache-control']).toBe('no-cache, no-transform');
  });

  it.each([
    ['structured', { towns: ['Ellon'], minBedrooms: 3, maxBedrooms: 3 }],
    ['semantic', {}],
    ['hybrid', { towns: ['Ellon'] }],
  ])('streams every event in order for a %s question', async (intent, filters) => {
    modelAnswers(routerReply(intent, filters), ROWS_SQL, ['Here are ', 'the homes.']);

    const events = eventsOf(await ask({ question: QUESTION, sessionId: SESSION_ID }));

    expect(typesOf(events)).toEqual(['route', 'retrieval', 'token', 'citations', 'done']);
    expect(events[0]).toMatchObject({ type: 'route', intent, fallback: null });
    expect(events[1]).toMatchObject({ type: 'retrieval', kind: 'properties' });
    expect(tokens(events)).toBe('Here are the homes.');
  });

  it('cites a retrieved property and strips an invented one', async () => {
    modelAnswers(routerReply('structured', { towns: ['Ellon'] }), ROWS_SQL, []);
    const first = eventsOf(await ask({ question: QUESTION, sessionId: SESSION_ID }));
    const retrieval = first[1];
    if (retrieval.type !== 'retrieval' || retrieval.kind !== 'properties') {
      throw new Error('expected properties');
    }
    const real = retrieval.properties[0].id;
    modelAnswers(routerReply('structured', { towns: ['Ellon'] }), ROWS_SQL, [
      `One home [P-${real}] and one more [P-${INVENTED_ID.slice(0, 3)}`,
      `${INVENTED_ID.slice(3)}].`,
    ]);

    const events = eventsOf(await ask({ question: QUESTION, sessionId: SESSION_ID }));

    expect(tokens(events)).toBe(`One home [P-${real}] and one more.`);
    expect(events.find((event) => event.type === 'citations')).toEqual({
      type: 'citations',
      kind: 'properties',
      ids: [real],
    });
  });

  it('keeps the SQL order for a question that asks for one, and says so', async () => {
    modelAnswers(routerReply('hybrid', { towns: ['Ellon'] }), ROWS_SQL, ['The cheapest.']);

    const events = eventsOf(await ask({ question: QUESTION, sessionId: SESSION_ID }));

    const retrieval = events[1];
    if (retrieval.type !== 'retrieval' || retrieval.kind !== 'properties') {
      throw new Error('expected properties');
    }
    expect(retrieval.ranking).toBe('sql_order');
    const prices = retrieval.properties.map((property) => property.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('fuses rows that came in no particular order', async () => {
    modelAnswers(
      routerReply('hybrid', { towns: ['Ellon'] }),
      "SELECT p.id, p.full_address FROM properties p WHERE p.town = 'Ellon' AND p.bedrooms = 3",
      ['Some homes.'],
    );

    const events = eventsOf(await ask({ question: QUESTION, sessionId: SESSION_ID }));

    expect(events[1]).toMatchObject({ kind: 'properties', ranking: 'fused' });
  });

  it('never returns a home outside the router price, even when the SQL is broader', async () => {
    const maxPrice = 150_000;
    modelAnswers(
      routerReply('hybrid', { towns: ['Ellon'], maxPrice }),
      "SELECT p.id FROM properties p WHERE p.town = 'Ellon' AND p.price < 400000",
      ['Some homes.'],
    );

    const events = eventsOf(await ask({ question: QUESTION, sessionId: SESSION_ID }));

    const retrieval = events[1];
    if (retrieval.type !== 'retrieval' || retrieval.kind !== 'properties') {
      throw new Error('expected properties');
    }
    expect(retrieval.properties.length).toBeGreaterThan(0);
    for (const property of retrieval.properties) {
      expect(property.price).toBeLessThanOrEqual(maxPrice);
      expect(property.town).toBe('Ellon');
    }
  });

  it('streams an aggregate with its query and listing count', async () => {
    modelAnswers(routerReply('structured', { towns: ['Stonehaven'] }), COUNT_SQL, [
      'There are that many listings [SQL].',
    ]);

    const events = eventsOf(await ask({ question: QUESTION, sessionId: SESSION_ID }));

    expect(events[1]).toMatchObject({ type: 'retrieval', kind: 'aggregate' });
    expect(events.find((event) => event.type === 'citations')).toMatchObject({
      kind: 'aggregate',
      listingCount: expect.any(Number) as number,
    });
  });

  it('declines an out of scope question with no retrieval and no answer call', async () => {
    modelAnswers(routerReply('out_of_scope'), ROWS_SQL, ['never sent']);

    const events = eventsOf(await ask({ question: QUESTION, sessionId: SESSION_ID }));

    expect(events.map((event) => event.type)).toEqual(['route', 'token', 'citations', 'done']);
    expect(tokens(events)).toBe(ROUTER_DECLINE_MESSAGE);
    expect(stream).not.toHaveBeenCalled();
  });

  it('says nothing matched, naming the filters, with no answer call', async () => {
    const filters = { towns: ['Westhill'], maxPrice: 1000 };
    modelAnswers(
      routerReply('structured', filters),
      "SELECT p.id FROM properties p WHERE p.town = 'Westhill' AND p.price <= 1000",
      ['never sent'],
    );

    const events = eventsOf(await ask({ question: QUESTION, sessionId: SESSION_ID }));

    expect(events.slice(1)).toEqual([
      { type: 'retrieval', kind: 'none', reason: 'no_match' },
      { type: 'token', text: noMatchMessage(searchFiltersSchema.parse(filters)) },
      { type: 'citations', kind: 'properties', ids: [] },
      { type: 'done' },
    ]);
    expect(tokens(events)).toContain('in Westhill, up to £1,000');
    expect(stream).not.toHaveBeenCalled();
  });

  it('says the search failed, not that nothing matched, when the SQL is refused', async () => {
    modelAnswers(routerReply('structured', { towns: ['Ellon'] }), 'DELETE FROM properties', [
      'never sent',
    ]);

    const events = eventsOf(await ask({ question: QUESTION, sessionId: SESSION_ID }));

    expect(events.slice(1)).toEqual([
      { type: 'retrieval', kind: 'none', reason: 'search_failed' },
      { type: 'token', text: SEARCH_FAILED_MESSAGE },
      { type: 'citations', kind: 'properties', ids: [] },
      { type: 'done' },
    ]);
    expect(stream).not.toHaveBeenCalled();
  });

  it('ends with one safe error event when the answer fails mid stream', async () => {
    modelAnswers(routerReply('semantic'), ROWS_SQL, []);
    stream.mockImplementation(async function* () {
      await Promise.resolve();
      yield { kind: 'text', text: 'Two homes' };
      throw new Error('socket hang up at 10.0.0.1');
    });

    const response = await ask({ question: QUESTION, sessionId: SESSION_ID });
    const events = eventsOf(response);

    expect(events.at(-1)).toEqual({ type: 'error', message: CHAT_ERROR_MESSAGE });
    expect(events.filter((event) => event.type === 'error')).toHaveLength(1);
    expect(events.some((event) => event.type === 'done')).toBe(false);
    expect(response.text).not.toContain('10.0.0.1');
  });

  it.each([
    ['no session id', { question: QUESTION }],
    ['a session id that is not a UUID', { question: QUESTION, sessionId: 'abc' }],
    ['an empty question', { question: '   ', sessionId: SESSION_ID }],
    ['an unknown field', { question: QUESTION, sessionId: SESSION_ID, debug: true }],
  ])('refuses %s with a 400 before the stream opens', async (_, body) => {
    const response = await ask(body);

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(complete).not.toHaveBeenCalled();
  });
});
