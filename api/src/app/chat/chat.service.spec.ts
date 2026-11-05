import { chatEventSchema, searchFiltersSchema } from '../../contracts/index.js';
import type { ChatEvent, PropertySummary } from '../../contracts/index.js';
import type { AppLogger } from '../../platform/logging/app-logger.js';
import type {
  HybridRetrieval,
  HybridRetrievalService,
} from '../retrieval/hybrid-retrieval.service.js';
import type { QueryRouter } from '../router/query-router.js';
import type { Route } from '../router/route.js';
import { ROUTER_DECLINE_MESSAGE } from '../router/router-decline.js';
import type { GuardedAnswer, GuardedAnswerEvent } from './answer/guarded-answer.js';
import { ChatService } from './chat.service.js';
import { noMatchMessage, SEARCH_FAILED_MESSAGE } from './no-results/no-results-message.js';

// Not a phrase any fake returns, so finding it in a log would be a leak.
const QUESTION = 'a quiet 3 bed family home in Inverurie under £250k';
const LARKFIELD_RISE = '1207';
const AGGREGATE_SQL = 'SELECT COUNT(*) AS listings FROM properties WHERE town = ? LIMIT 50';

function route(intent: Route['intent']): Route {
  return {
    intent,
    filters: searchFiltersSchema.parse({ towns: ['Inverurie'] }),
    semanticQuery: intent === 'structured' ? '' : 'a quiet family home',
    standaloneQuestion: QUESTION,
    propertyIds: [],
    fallback: null,
  };
}

function card(id: string): PropertySummary {
  return {
    id,
    address: '20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK',
    price: 229_000,
    bedrooms: 3,
    bathrooms: 2,
    publicRooms: 1,
    areaM2: 97,
    town: 'Aberdeen',
    postcodeDistrict: 'AB21',
    councilTaxBand: 'E',
    heatingType: 'gas',
    hasGarden: true,
    hasGarage: false,
    hasDoubleGarage: false,
    hasOffStreetParking: false,
    hasLand: false,
    hasGroundFloorBedroomBathroom: false,
    hasGrannyFlat: false,
    hasGreenEnergy: false,
    hasElectricVehicleChargePoint: false,
    isNewBuild: false,
  };
}

const EMPTY: HybridRetrieval = {
  properties: [],
  ranking: 'fused',
  violations: [],
  sql: null,
  failures: [],
  timing: { branches: {}, totalMs: 4 },
};

const FOUND: HybridRetrieval = {
  ...EMPTY,
  properties: [
    {
      property: card(LARKFIELD_RISE),
      disclosure: null,
      score: 0.03,
      placements: { sql: { rank: 1, score: null }, knn: null, bm25: null },
    },
  ],
};

const AGGREGATE: HybridRetrieval = {
  ...EMPTY,
  ranking: 'aggregate',
  violations: [],
  sql: {
    query: AGGREGATE_SQL,
    aggregate: { kind: 'aggregate', values: [{ listings: 53 }], listingCount: 53 },
  },
};

const ANSWER: GuardedAnswerEvent[] = [
  { kind: 'text', text: 'One home has a garden ' },
  { kind: 'text', text: '[P-1207].' },
  {
    kind: 'end',
    text: 'One home has a garden [P-1207].',
    citations: { type: 'citations', kind: 'properties', ids: [LARKFIELD_RISE] },
    stripped: [{ marker: '[P-9999]', reason: 'unknown_id' }],
    completion: {
      text: 'One home has a garden [P-1207] [P-9999].',
      model: 'answer-model',
      inputTokens: 900,
      outputTokens: 30,
      stopReason: 'stop',
    },
  },
];

function build(
  routed: Route,
  found: HybridRetrieval = FOUND,
): {
  service: ChatService;
  retrieve: ReturnType<typeof vi.fn>;
  stream: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
} {
  const retrieve = vi.fn(() => Promise.resolve(found));
  const stream = vi.fn(async function* (): AsyncGenerator<GuardedAnswerEvent> {
    for (const piece of ANSWER) {
      await Promise.resolve();
      yield piece;
    }
  });
  const log = vi.fn();
  const service = new ChatService(
    { route: () => Promise.resolve(routed) } as unknown as QueryRouter,
    { retrieve } as unknown as HybridRetrievalService,
    { stream } as unknown as GuardedAnswer,
    { log } as unknown as AppLogger,
  );
  return { service, retrieve, stream, log };
}

async function collect(events: AsyncIterable<ChatEvent>): Promise<ChatEvent[]> {
  const seen: ChatEvent[] = [];
  for await (const event of events) {
    seen.push(event);
  }
  return seen;
}

function types(events: readonly ChatEvent[]): string[] {
  return events.map((event) => event.type);
}

describe('ChatService', () => {
  it.each(['structured', 'semantic', 'hybrid'] as const)(
    'streams route, retrieval, tokens, citations and done for a %s question',
    async (intent) => {
      const { service } = build(route(intent));

      const events = await collect(service.answerQuestion(QUESTION));

      expect(types(events)).toEqual(['route', 'retrieval', 'token', 'token', 'citations', 'done']);
      expect(events[0]).toMatchObject({ type: 'route', intent, standaloneQuestion: QUESTION });
      expect(events[1]).toEqual({
        type: 'retrieval',
        kind: 'properties',
        properties: [card(LARKFIELD_RISE)],
        ranking: 'fused',
      });
      expect(events[4]).toEqual({ type: 'citations', kind: 'properties', ids: [LARKFIELD_RISE] });
      for (const event of events) {
        expect(chatEventSchema.safeParse(event).success).toBe(true);
      }
    },
  );

  it('answers the standalone question over what retrieval found', async () => {
    const { service, retrieve, stream } = build(route('hybrid'));

    await collect(service.answerQuestion(QUESTION));

    expect(retrieve).toHaveBeenCalledWith(route('hybrid'));
    expect(stream).toHaveBeenCalledWith(QUESTION, FOUND);
  });

  it('declines an out of scope question with no retrieval and no answer call', async () => {
    const { service, retrieve, stream } = build(route('out_of_scope'));

    const events = await collect(service.answerQuestion(QUESTION));

    expect(events).toEqual([
      expect.objectContaining({ type: 'route', intent: 'out_of_scope' }),
      { type: 'token', text: ROUTER_DECLINE_MESSAGE },
      { type: 'citations', kind: 'properties', ids: [] },
      { type: 'done' },
    ]);
    expect(retrieve).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
  });

  it('sends an aggregate as its query, values and listing count', async () => {
    const { service } = build(route('structured'), AGGREGATE);

    const events = await collect(service.answerQuestion(QUESTION));

    expect(events[1]).toEqual({
      type: 'retrieval',
      kind: 'aggregate',
      sql: AGGREGATE_SQL,
      values: [{ listings: 53 }],
      listingCount: 53,
    });
  });

  it('answers a no match with fixed text naming the filters, and no answer call', async () => {
    const { service, stream } = build(route('structured'), EMPTY);

    const events = await collect(service.answerQuestion(QUESTION));

    expect(events.slice(1)).toEqual([
      { type: 'retrieval', kind: 'none', reason: 'no_match' },
      { type: 'token', text: noMatchMessage(route('structured').filters) },
      { type: 'citations', kind: 'properties', ids: [] },
      { type: 'done' },
    ]);
    expect(stream).not.toHaveBeenCalled();
  });

  it('says the search failed, not that nothing matched, when a branch failed', async () => {
    const { service, stream } = build(route('hybrid'), {
      ...EMPTY,
      failures: [{ branch: 'sql', reason: 'timeout' }],
    });

    const events = await collect(service.answerQuestion(QUESTION));

    expect(events.slice(1)).toEqual([
      { type: 'retrieval', kind: 'none', reason: 'search_failed' },
      { type: 'token', text: SEARCH_FAILED_MESSAGE },
      { type: 'citations', kind: 'properties', ids: [] },
      { type: 'done' },
    ]);
    expect(stream).not.toHaveBeenCalled();
  });

  it('still answers from what came back when one branch failed', async () => {
    const { service, stream } = build(route('hybrid'), {
      ...FOUND,
      failures: [{ branch: 'knn', reason: 'failed' }],
    });

    const events = await collect(service.answerQuestion(QUESTION));

    expect(events[1]).toMatchObject({ kind: 'properties' });
    expect(stream).toHaveBeenCalledOnce();
  });

  it('answers an aggregate, which names no property', async () => {
    const { service, stream } = build(route('structured'), AGGREGATE);

    await collect(service.answerQuestion(QUESTION));

    expect(stream).toHaveBeenCalledOnce();
  });

  it('logs why there was nothing to answer from', async () => {
    const { service, log } = build(route('structured'), EMPTY);

    await collect(service.answerQuestion(QUESTION));

    expect(log.mock.calls[0][1]).toMatchObject({ properties: 0, noResults: 'no_match' });
  });

  it('logs one line per turn with counts and timings, never the question or the answer', async () => {
    const { service, log } = build(route('hybrid'));

    await collect(service.answerQuestion(QUESTION));

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe('chat turn');
    expect(log.mock.calls[0][1]).toMatchObject({
      intent: 'hybrid',
      properties: 1,
      noResults: null,
      stripped: 1,
      firstTokenMs: expect.any(Number) as number,
    });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('Inverurie under');
    expect(logged).not.toContain('garden');
  });

  it('lets a retrieval failure reach the caller, which ends the stream', async () => {
    const { service, retrieve } = build(route('hybrid'));
    retrieve.mockRejectedValueOnce(new Error('MySQL is down'));

    const events: ChatEvent[] = [];
    await expect(
      (async (): Promise<void> => {
        for await (const event of service.answerQuestion(QUESTION)) {
          events.push(event);
        }
      })(),
    ).rejects.toThrow('MySQL is down');
    expect(types(events)).toEqual(['route']);
  });

  it('says the properties kept the SQL order when the question asked for one', async () => {
    const { service } = build(route('structured'), { ...FOUND, ranking: 'sql_order' });

    const events = await collect(service.answerQuestion(QUESTION));

    expect(events[1]).toMatchObject({ kind: 'properties', ranking: 'sql_order' });
  });
});
