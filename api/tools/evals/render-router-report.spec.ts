import { renderRouterReport } from './render-router-report.ts';
import type { RouterEvalRun, RouterQuestionResult } from './render-router-report.ts';
import { extractSection, NARRATIVE_HEADING } from './render-semantic-report.ts';

function question(overrides: Partial<RouterQuestionResult> = {}): RouterQuestionResult {
  return {
    id: 'count-stonehaven',
    source: 'golden: aggregates_and_ordering',
    question: 'How many listings are there in Stonehaven?',
    expectedIntents: ['structured'],
    intent: 'structured',
    filters: ['towns', 'propertyKinds'],
    score: {
      intentCorrect: true,
      filters: [
        { filter: 'towns', outcome: 'matched' },
        { filter: 'propertyKinds', outcome: 'matched' },
      ],
    },
    dropped: 0,
    fallback: null,
    latencyMs: 812,
    ...overrides,
  };
}

const MISS = question({
  id: 'quiet-family-home-inverurie',
  source: 'cases: hybrid',
  question: 'a quiet 3 bed family home in Inverurie | under £250k',
  expectedIntents: ['hybrid'],
  intent: 'semantic',
  filters: [],
  score: { intentCorrect: false, filters: [{ filter: 'towns', outcome: 'missed' }] },
  dropped: 1,
  fallback: 'timeout',
});

function run(overrides: Partial<RouterEvalRun> = {}): RouterEvalRun {
  return {
    finishedAt: new Date('2026-10-03T20:00:00Z'),
    durationMs: 95_000,
    provider: 'some-provider',
    model: 'router-model',
    prompt: 'router.v1',
    timeoutMs: 5000,
    temperature: 0,
    questions: [question(), MISS],
    narrative: null,
    ...overrides,
  };
}

describe('renderRouterReport', () => {
  const report = renderRouterReport(run());

  it('records what produced the run', () => {
    expect(report).toContain('| Router model | router-model |');
    expect(report).toContain('| Prompt | router.v1 |');
    expect(report).toContain('| Router timeout | 5000 ms |');
    expect(report).toContain('| Router temperature | 0 |');
    expect(report).toContain('| Run time | 95 s |');
  });

  it('sums up intents, filters, fallbacks and drops', () => {
    expect(report).toContain('| Intent right | 1 of 2 (50 percent) |');
    expect(report).toContain('| Filter precision | 2 of 2 (100 percent) |');
    expect(report).toContain('| Filter recall | 2 of 3 (67 percent) |');
    expect(report).toContain('| Fallbacks | 1 timeout |');
    expect(report).toContain('| Values dropped | 1 |');
  });

  it('breaks intents down by source and filters by name', () => {
    expect(report).toContain('| golden: aggregates_and_ordering | 1 | 1 of 1 (100 percent) |');
    expect(report).toContain('| cases: hybrid | 1 | 0 of 1 (0 percent) |');
    expect(report).toContain('| towns | 1 | 0 | 1 | 0 |');
  });

  it('lists each miss, escaping pipes in the question', () => {
    expect(report).toContain(
      '| a quiet 3 bed family home in Inverurie \\| under £250k | hybrid | semantic | timeout |',
    );
  });

  it('marks a wrong intent in bold in the full table', () => {
    expect(report).toContain('| **semantic** | none | towns missed | 1 | timeout | 812 |');
  });

  it('says so when there is nothing to score', () => {
    const empty = renderRouterReport(run({ questions: [] }));

    expect(empty).toContain('| Intent right | none to score |');
    expect(empty).toContain('| Fallbacks | none |');
    expect(empty).toMatch(/## Intent misses\n\nNone\./);
  });

  it('keeps a narrative written by hand where a rerun can find it', () => {
    const written = renderRouterReport(run({ narrative: 'The router reads towns well.' }));

    expect(extractSection(written, NARRATIVE_HEADING)).toBe('The router reads towns well.');
    expect(extractSection(report, NARRATIVE_HEADING)).toBe('_Not written yet._');
  });
});
