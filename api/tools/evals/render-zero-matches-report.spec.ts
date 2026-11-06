import { isPassed, renderZeroMatchesReport } from './render-zero-matches-report.ts';
import type { ZeroMatchesEvalRun, ZeroMatchResult } from './render-zero-matches-report.ts';

const PASSED: ZeroMatchResult = {
  question: 'Homes for sale in Westhill under £50,000',
  intent: 'structured',
  fallback: null,
  referenceRows: 0,
  retrieval: 'none: no_match',
  reply: 'No listings in this data match everything you asked for: in Westhill, up to £50,000.',
  fixedMessage: true,
  citations: 0,
  answerCalls: 0,
};

function run(results: readonly ZeroMatchResult[]): ZeroMatchesEvalRun {
  return {
    finishedAt: new Date('2026-10-10T09:00:00Z'),
    durationMs: 60_000,
    provider: 'some-provider',
    routerModel: 'router-model',
    sqlModel: 'sql-model',
    results,
    narrative: null,
  };
}

describe('isPassed', () => {
  it('passes a no match answered with the fixed message', () => {
    expect(isPassed(PASSED)).toBe(true);
  });

  it.each([
    ['a reference query that now finds rows', { referenceRows: 2 }],
    ['a failed search', { retrieval: 'none: search_failed' }],
    ['retrieval that found properties', { retrieval: 'properties' }],
    ['a reply that is not the fixed message', { fixedMessage: false }],
    ['a citation', { citations: 1 }],
    ['an answer model call', { answerCalls: 1 }],
  ])('fails %s', (_, change) => {
    expect(isPassed({ ...PASSED, ...change })).toBe(false);
  });
});

describe('renderZeroMatchesReport', () => {
  it('counts the questions that passed', () => {
    expect(renderZeroMatchesReport(run([PASSED, { ...PASSED, answerCalls: 1 }]))).toContain(
      'no answer model call and no citation: 1 of 2.',
    );
  });

  it('marks a failed question in bold and quotes every reply', () => {
    const report = renderZeroMatchesReport(run([{ ...PASSED, citations: 1 }]));

    expect(report).toContain('| 1 | 0 | **no** |');
    expect(report).toContain(`> ${PASSED.reply}`);
  });
});
