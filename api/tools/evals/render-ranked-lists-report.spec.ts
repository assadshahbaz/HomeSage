import { renderRankedListsReport } from './render-ranked-lists-report.ts';
import type {
  RankedListsEvalRun,
  RankedListsQuestionResult,
} from './render-ranked-lists-report.ts';

function score(found: number, possible: number): RankedListsQuestionResult['knn'] {
  return { found, possible, recall: found / possible };
}

const QUESTIONS: RankedListsQuestionResult[] = [
  {
    id: 'semantic-annexe',
    question: 'a house with a separate annexe where a relative could live',
    knn: score(2, 8),
    bm25: score(6, 8),
    either: score(7, 8),
  },
  {
    id: 'semantic-garden',
    question: 'cosy flat with a garden and a quiet street',
    knn: score(4, 4),
    bm25: score(1, 4),
    either: score(4, 4),
  },
];

function run(overrides: Partial<RankedListsEvalRun> = {}): RankedListsEvalRun {
  return {
    finishedAt: new Date('2026-10-10T09:00:00Z'),
    durationMs: 12_400,
    embeddingModel: 'embed-model',
    index: 'homesage-properties',
    topK: 8,
    questions: QUESTIONS,
    narrative: null,
    ...overrides,
  };
}

describe('renderRankedListsReport', () => {
  const report = renderRankedListsReport(run());

  it('records what produced the run', () => {
    expect(report).toContain('| Embedding model | embed-model |');
    expect(report).toContain('| Top k | 8 |');
    expect(report).toContain('| Questions | 2 |');
    expect(report).toContain('| Run time | 12 s |');
  });

  it('totals each ranking over every question, found out of possible', () => {
    expect(report).toContain('| kNN alone | 6 of 12 (50 percent) |');
    expect(report).toContain('| BM25 alone | 7 of 12 (58 percent) |');
    expect(report).toContain('| Either top 8 | 11 of 12 (92 percent) |');
  });

  it('lists every question with its three scores', () => {
    expect(report).toContain(
      '| a house with a separate annexe where a relative could live | 2 of 8 | 6 of 8 | 7 of 8 |',
    );
  });

  it('keeps the hand written narrative, or marks it as missing', () => {
    expect(report).toContain('## What it shows\n\n_Not written yet._');
    expect(renderRankedListsReport(run({ narrative: 'BM25 finds the annexes.' }))).toContain(
      '## What it shows\n\nBM25 finds the annexes.',
    );
  });
});
