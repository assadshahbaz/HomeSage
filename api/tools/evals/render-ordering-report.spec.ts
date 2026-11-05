import { isCorrect, renderOrderingReport } from './render-ordering-report.ts';
import type { OrderingEvalRun, OrderingResult } from './render-ordering-report.ts';

const AGGREGATE: OrderingResult = {
  question: 'How many listings are there in Stonehaven?',
  expected: 'aggregate',
  intent: 'structured',
  ranking: 'aggregate',
  retrieval: { passed: true, reason: '1 rows match' },
  cited: 'SQL',
  citationsFit: true,
};

const ORDERED: OrderingResult = {
  question: 'What are the five cheapest 3 bedroom homes in Ellon?',
  expected: 'ordered rows',
  intent: 'structured',
  ranking: 'sql_order',
  retrieval: { passed: true, reason: '5 rows match' },
  cited: 'P-2529, P-4265',
  citationsFit: true,
};

function run(results: readonly OrderingResult[]): OrderingEvalRun {
  return {
    finishedAt: new Date('2026-10-10T09:00:00Z'),
    durationMs: 60_000,
    provider: 'some-provider',
    answerModel: 'answer-model',
    results,
    narrative: null,
  };
}

describe('isCorrect', () => {
  it.each([
    ['an aggregate on the aggregate path', AGGREGATE, true],
    ['ordered rows kept in SQL order', ORDERED, true],
    ['ordered rows that were fused', { ...ORDERED, ranking: 'fused' }, false],
    ['an aggregate the router declined', { ...AGGREGATE, ranking: 'declined' }, false],
    [
      'rows that miss the reference',
      { ...ORDERED, retrieval: { passed: false, reason: 'row 2 is missing' } },
      false,
    ],
    ['an aggregate answer that cited a property', { ...AGGREGATE, citationsFit: false }, false],
  ])('judges %s', (_, result, expected) => {
    expect(isCorrect(result)).toBe(expected);
  });
});

describe('renderOrderingReport', () => {
  it('counts the correct questions and marks each failure', () => {
    const report = renderOrderingReport(run([AGGREGATE, { ...ORDERED, ranking: 'fused' }]));

    expect(report).toContain('Correct path, retrieval and citations: 1 of 2.');
    expect(report).toContain(
      '| What are the five cheapest 3 bedroom homes in Ellon? | ordered rows | structured | fused | pass: 5 rows match | P-2529, P-4265 | yes |',
    );
  });
});
