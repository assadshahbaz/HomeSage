import { idsOutside, renderCitationsReport } from './render-citations-report.ts';
import type { CitationResult, CitationsEvalRun } from './render-citations-report.ts';

const CLEAN: CitationResult = {
  id: 'inverurie-asbestos',
  question: 'Properties in Inverurie where the seller reported asbestos',
  intent: 'structured',
  declined: false,
  contextIds: ['3856', '2719'],
  aggregate: false,
  citedIds: ['3856', '2719'],
  citedSql: false,
  stripped: [],
  leakedIds: [],
  streamMatches: true,
};

const GUARDED: CitationResult = {
  ...CLEAN,
  id: 'cosy-flat-garden-quiet-street',
  question: 'cosy flat with a garden and a quiet street',
  intent: 'semantic',
  stripped: ['[P-9999] unknown_id'],
};

const DECLINED: CitationResult = {
  ...CLEAN,
  id: 'decline-epc-rating',
  question: 'Which homes in Aberdeen have an EPC rating of B or better?',
  intent: 'out_of_scope',
  declined: true,
  contextIds: [],
  citedIds: [],
};

function run(overrides: Partial<CitationsEvalRun> = {}): CitationsEvalRun {
  return {
    finishedAt: new Date('2026-10-10T09:00:00Z'),
    durationMs: 120_000,
    provider: 'some-provider',
    answerModel: 'answer-model',
    results: [CLEAN, GUARDED, DECLINED],
    narrative: null,
    ...overrides,
  };
}

describe('idsOutside', () => {
  it.each([
    ['ids in markers that were retrieved', 'A garden [P-3856].', []],
    ['an id in a marker that was not', 'A garden [P-9999].', ['9999']],
    ['an id written outside a marker', 'Home P-9999 has a garden.', ['9999']],
    ['the same id twice', 'P-9999 and [P-9999].', ['9999']],
  ])('finds %s', (_, text, expected) => {
    expect(idsOutside(text, ['3856'])).toEqual(expected);
  });
});

describe('renderCitationsReport', () => {
  it('counts answered questions and markers removed, leaving declined ones out', () => {
    const report = renderCitationsReport(run());

    expect(report).toContain('| Answered | 2 of 3 |');
    expect(report).toContain('| Markers removed by the guard | 1 |');
    expect(report).toContain(
      '| Answers with an id outside the retrieval in the streamed text | 0 |',
    );
  });

  it('marks a stream that differs from the guarded text', () => {
    const report = renderCitationsReport(run({ results: [{ ...CLEAN, streamMatches: false }] }));

    expect(report).toContain('| Answers whose streamed text differs from the guarded text | 1 |');
    expect(report).toContain('| **no** |');
  });

  it('lists each question with what it cited and what was removed', () => {
    const report = renderCitationsReport(run());

    expect(report).toContain(
      '| cosy flat with a garden and a quiet street | semantic | 2 | P-3856, P-2719 | [P-9999] unknown_id | none | yes |',
    );
    expect(report).toContain('| out_of_scope | 0 | declined | none | none |  |');
  });

  it('shows an aggregate turn citing its query', () => {
    const report = renderCitationsReport(
      run({ results: [{ ...CLEAN, aggregate: true, citedIds: [], citedSql: true }] }),
    );

    expect(report).toContain('| structured | aggregate | SQL |');
  });
});
