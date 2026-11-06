import { isFullAndMixed, renderHybridRetrievalReport } from './render-hybrid-retrieval-report.ts';
import type { HybridCaseResult, HybridRetrievalEvalRun } from './render-hybrid-retrieval-report.ts';

const MIXED: HybridCaseResult = {
  question: 'a quiet 3 bed family home in Inverurie under £250k',
  intent: 'hybrid',
  properties: 8,
  unique: 8,
  fromSql: 5,
  fromKnn: 4,
  fromBm25: 3,
  failures: [],
  totalMs: 2140,
};

const SQL_DOWN: HybridCaseResult = {
  ...MIXED,
  question: 'charming cottage in Banchory with a garden for under £350,000',
  fromSql: 0,
  failures: ['sql: rejected'],
};

function run(overrides: Partial<HybridRetrievalEvalRun> = {}): HybridRetrievalEvalRun {
  return {
    finishedAt: new Date('2026-10-10T09:00:00Z'),
    durationMs: 240_000,
    provider: 'some-provider',
    sqlModel: 'answer-model',
    routerModel: 'router-model',
    embeddingModel: 'embed-model',
    branchTimeoutMs: 15_000,
    topK: 8,
    semantic: [
      {
        question: 'cosy flat with a garden and a quiet street',
        fused: { found: 7, possible: 8, recall: 7 / 8 },
      },
      {
        question: 'a home that runs on renewable energy',
        fused: { found: 2, possible: 8, recall: 2 / 8 },
      },
    ],
    hybrid: [MIXED, SQL_DOWN],
    narrative: null,
    ...overrides,
  };
}

describe('isFullAndMixed', () => {
  it('holds for a full, unique top k drawn from SQL and a search', () => {
    expect(isFullAndMixed(MIXED, 8)).toBe(true);
  });

  it.each([
    ['fewer than k properties', { properties: 6, unique: 6 }],
    ['a repeated property', { unique: 7 }],
    ['nothing from SQL', { fromSql: 0 }],
    ['nothing from either search', { fromKnn: 0, fromBm25: 0 }],
  ])('fails with %s', (_, overrides) => {
    expect(isFullAndMixed({ ...MIXED, ...overrides }, 8)).toBe(false);
  });
});

describe('renderHybridRetrievalReport', () => {
  const report = renderHybridRetrievalReport(run());

  it('records what produced the run', () => {
    expect(report).toContain('| SQL model | answer-model |');
    expect(report).toContain('| Branch deadline | 15000 ms |');
    expect(report).toContain('| Run time | 240 s |');
  });

  it('sums fused recall and counts the hybrid questions that met the bar', () => {
    expect(report).toContain('| Fused recall@8, semantic slice | 9 of 16 (56 percent) |');
    expect(report).toContain(
      '| Hybrid questions with 8 unique properties from SQL and a search | 1 of 2 |',
    );
  });

  it('lists each hybrid question with where its properties came from and what failed', () => {
    expect(report).toContain(
      '| a quiet 3 bed family home in Inverurie under £250k | hybrid | 8 | 8 | 5 | 4 | 3 | none | 2140 |',
    );
    expect(report).toContain('| sql: rejected |');
  });

  it('keeps the hand written narrative, or marks it as missing', () => {
    expect(report).toContain('## What it shows\n\n_Not written yet._');
    expect(renderHybridRetrievalReport(run({ narrative: 'Fusion helps.' }))).toContain(
      '## What it shows\n\nFusion helps.',
    );
  });
});
