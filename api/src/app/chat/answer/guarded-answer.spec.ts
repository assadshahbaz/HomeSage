import type { PropertySummary } from '../../../contracts/index.js';
import type { LlmCompletion, LlmStreamEvent } from '../../../core/llm-provider.js';
import type { AppLogger } from '../../../platform/logging/app-logger.js';
import type { HybridRetrieval } from '../../retrieval/hybrid-retrieval.service.js';
import type { AnswerGenerator } from './answer-generator.js';
import { GuardedAnswer } from './guarded-answer.js';
import type { GuardedAnswerEvent } from './guarded-answer.js';

const QUESTION = '3 bed homes in Inverurie with a garden';
const LARKFIELD_RISE = '1207';
const ELLON_FLAT = '1342';
const AGGREGATE_SQL = 'SELECT COUNT(*) AS listings FROM properties WHERE town = ? LIMIT 50';

function completion(text: string): LlmCompletion {
  return { text, model: 'answer-model', inputTokens: 900, outputTokens: 40, stopReason: 'stop' };
}

const PROPERTY_TURN: HybridRetrieval = {
  properties: [LARKFIELD_RISE, ELLON_FLAT].map((id) => ({
    property: { id } as PropertySummary,
    disclosure: null,
    score: 0.03,
    placements: { sql: { rank: 1, score: null }, knn: null, bm25: null },
  })),
  ranking: 'fused',
  violations: [],
  sql: null,
  failures: [],
  timing: { branches: {}, totalMs: 1 },
};

const AGGREGATE_TURN: HybridRetrieval = {
  ...PROPERTY_TURN,
  properties: [],
  ranking: 'aggregate',
  violations: [],
  sql: {
    query: AGGREGATE_SQL,
    aggregate: { kind: 'aggregate', values: [{ listings: 53 }], listingCount: 53 },
  },
};

function build(pieces: readonly string[]): {
  answer: GuardedAnswer;
  stream: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
} {
  const stream = vi.fn(async function* (): AsyncGenerator<LlmStreamEvent> {
    for (const text of pieces) {
      await Promise.resolve();
      yield { kind: 'text', text };
    }
    yield { kind: 'end', completion: completion(pieces.join('')) };
  });
  const warn = vi.fn();
  const answer = new GuardedAnswer(
    { stream } as unknown as AnswerGenerator,
    { warn } as unknown as AppLogger,
  );
  return { answer, stream, warn };
}

async function collect(stream: AsyncIterable<GuardedAnswerEvent>): Promise<GuardedAnswerEvent[]> {
  const seen: GuardedAnswerEvent[] = [];
  for await (const event of stream) {
    seen.push(event);
  }
  return seen;
}

function texts(events: readonly GuardedAnswerEvent[]): string[] {
  return events.flatMap((event) => (event.kind === 'text' ? [event.text] : []));
}

function end(events: readonly GuardedAnswerEvent[]): Extract<GuardedAnswerEvent, { kind: 'end' }> {
  const last = events.at(-1);
  if (last?.kind !== 'end') {
    throw new Error('the stream did not end');
  }
  return last;
}

describe('GuardedAnswer', () => {
  it('asks the generator for the answer to the question over the retrieval', async () => {
    const { answer, stream } = build(['No listing matches.']);

    await collect(answer.stream(QUESTION, PROPERTY_TURN));

    expect(stream).toHaveBeenCalledWith(QUESTION, PROPERTY_TURN);
  });

  it('passes on only guarded text, never an empty piece, even for an id split across pieces', async () => {
    const { answer } = build(['A garden [P-12', '07] and a pool [P-99', '99].']);

    const events = await collect(answer.stream(QUESTION, PROPERTY_TURN));

    expect(texts(events)).toEqual(['A garden', ' [P-1207] and a pool', '.']);
    expect(texts(events).join('')).not.toContain('9999');
  });

  it('ends with the guarded text, exactly the pieces joined, and the cited ids', async () => {
    const { answer } = build(['[P-1342] and [P-1207] have gardens; [P-9999] too.']);

    const events = await collect(answer.stream(QUESTION, PROPERTY_TURN));

    const last = end(events);
    expect(last.text).toBe(texts(events).join(''));
    expect(last.text).toBe('[P-1342] and [P-1207] have gardens; too.');
    expect(last.citations).toEqual({
      type: 'citations',
      kind: 'properties',
      ids: [ELLON_FLAT, LARKFIELD_RISE],
    });
    expect(last.completion.outputTokens).toBe(40);
  });

  it('logs each removed marker once as a hallucination, never the answer', async () => {
    const { answer, warn } = build(['A pool [P-9999] and [SQL].']);

    await collect(answer.stream(QUESTION, PROPERTY_TURN));

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'hallucination',
      { marker: '[P-9999]', reason: 'unknown_id' },
      'GuardedAnswer',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('A pool');
  });

  it('cites the aggregate query when an aggregate turn kept its [SQL]', async () => {
    const { answer } = build(['There are 53 listings [SQL].']);

    const last = end(await collect(answer.stream(QUESTION, AGGREGATE_TURN)));

    expect(last.citations).toEqual({
      type: 'citations',
      kind: 'aggregate',
      sql: AGGREGATE_SQL,
      listingCount: 53,
    });
  });

  it('cites no property when an aggregate turn quoted no [SQL]', async () => {
    const { answer } = build(['There are 53 listings, such as [P-1207].']);

    const last = end(await collect(answer.stream(QUESTION, AGGREGATE_TURN)));

    expect(last.text).toBe('There are 53 listings, such as.');
    expect(last.citations).toEqual({ type: 'citations', kind: 'properties', ids: [] });
  });

  it('uses a fresh guard for each answer', async () => {
    const { answer } = build(['A garden [P-1207].']);

    await collect(answer.stream(QUESTION, PROPERTY_TURN));
    const second = end(
      await collect(answer.stream(QUESTION, { ...PROPERTY_TURN, properties: [] })),
    );

    expect(second.text).toBe('A garden.');
    expect(second.citations).toMatchObject({ ids: [] });
  });
});
