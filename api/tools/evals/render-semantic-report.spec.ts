import {
  extractSection,
  isClean,
  NARRATIVE_HEADING,
  renderSemanticReport,
} from './render-semantic-report.ts';
import type { IndexCheck, SemanticEvalRun } from './render-semantic-report.ts';
import { SEMANTIC_SELECTION } from './semantic-selection.ts';

const MISSING_PROPERTY = 1529;
const ROWS = 792;
const CLEAN: IndexCheck = { mysqlRows: ROWS, indexed: ROWS, missing: [], extra: [] };

function run(overrides: Partial<SemanticEvalRun> = {}): SemanticEvalRun {
  return {
    finishedAt: new Date('2026-10-03T12:00:00Z'),
    durationMs: 90_000,
    embeddingProvider: 'local',
    embeddingModel: 'an-embedding-model',
    dimensions: 768,
    inputUsdPerMillion: 0,
    index: 'homesage-properties',
    topK: 8,
    maxTopK: 20,
    latencyLimitMs: 500,
    selection: SEMANTIC_SELECTION,
    questions: [
      {
        id: 'cosy-flat-garden-quiet-street',
        category: 'flat, garden',
        question: 'cosy flat with a garden and a quiet street',
        relevant: 40,
        uncertain: 1,
        atTopK: { found: 6, possible: 8, recall: 0.75 },
        atMax: { found: 10, possible: 20, recall: 0.5 },
      },
      {
        id: 'charge-an-electric-car-at-home',
        category: 'EV charge point',
        question: 'somewhere I can charge my electric car at home',
        relevant: 21,
        uncertain: 0,
        atTopK: { found: 8, possible: 8, recall: 1 },
        atMax: { found: 15, possible: 20, recall: 0.75 },
      },
    ],
    latency: { calls: 50, topK: 8, p50Ms: 120, p95Ms: 210, maxMs: 260 },
    ingestion: null,
    check: CLEAN,
    narrative: null,
    ...overrides,
  };
}

describe('isClean', () => {
  it.each<[string, IndexCheck, boolean]>([
    ['every property once', CLEAN, true],
    ['a missing property', { ...CLEAN, indexed: ROWS - 1, missing: [MISSING_PROPERTY] }, false],
    ['an extra document', { ...CLEAN, indexed: ROWS + 1, extra: ['P-1529'] }, false],
    ['a count that differs alone', { ...CLEAN, indexed: ROWS + 1 }, false],
  ])('%s', (_, check, clean) => {
    expect(isClean(check)).toBe(clean);
  });
});

describe('extractSection', () => {
  const report = [
    '# M2',
    '',
    NARRATIVE_HEADING,
    '',
    'kNN found streets named Gardens.',
    '',
    '### A detail',
    'BM25 found the flats.',
    '',
    '## How it is scored',
    'text',
  ].join('\r\n');

  it('keeps everything up to the next section, subheadings included', () => {
    expect(extractSection(report, NARRATIVE_HEADING)).toBe(
      'kNN found streets named Gardens.\n\n### A detail\nBM25 found the flats.',
    );
  });

  it('reads to the end when the section is last', () => {
    expect(extractSection(`${NARRATIVE_HEADING}\nlast words\n`, NARRATIVE_HEADING)).toBe(
      'last words',
    );
  });

  it.each([
    ['the heading is missing', '# M2\n\n## How it is scored\n'],
    ['nothing is under it', `${NARRATIVE_HEADING}\n\n## How it is scored\n`],
  ])('is null when %s', (_, markdown) => {
    expect(extractSection(markdown, NARRATIVE_HEADING)).toBeNull();
  });
});

describe('renderSemanticReport', () => {
  it('shows mean recall, latency against its limit and each question', () => {
    const report = renderSemanticReport(run());
    expect(report).toContain('| Mean recall at 8 | **88 percent** |');
    expect(report).toContain('| Mean recall at 20 | 63 percent |');
    expect(report).toContain('p50 **120 ms**, p95 **210 ms**');
    expect(report).toContain('under 500 ms at p95');
    expect(report).toContain('| Index against MySQL | every property once |');
    expect(report).toContain(
      '| cosy flat with a garden and a quiet street | flat, garden | 40 | 1 | 6 of 8 | 10 of 20 |',
    );
  });

  it('says when p95 is over the limit', () => {
    const report = renderSemanticReport(
      run({ latency: { calls: 50, topK: 8, p50Ms: 300, p95Ms: 650, maxMs: 900 } }),
    );
    expect(report).toContain('**not under** 500 ms at p95');
  });

  it('says ingestion was not run when the index was scored as it was', () => {
    expect(renderSemanticReport(run())).toContain('Set `EVAL_REINGEST=1`');
  });

  it('shows each ingestion run with its tokens, cost and index check', () => {
    const report = renderSemanticReport(
      run({
        ingestion: [
          {
            label: 'full run',
            read: ROWS,
            written: ROWS,
            failed: 0,
            durationMs: 300_000,
            embeddingCalls: 44,
            inputTokens: 912_345,
            costUsd: 0.1825,
            check: CLEAN,
          },
          {
            label: 'rerun',
            read: ROWS,
            written: ROWS - 1,
            failed: 1,
            durationMs: 310_000,
            embeddingCalls: 44,
            inputTokens: 912_345,
            costUsd: 0.1825,
            check: { ...CLEAN, indexed: ROWS - 1, missing: [MISSING_PROPERTY] },
          },
        ],
      }),
    );
    expect(report).toContain(
      '| full run | 792 | 792 | 0 | 300 s | 44 | 912345 | $0.1825 | 792 documents for 792 MySQL rows. Every property once |',
    );
    expect(report).toContain('1 missing: 1529. **Not clean**');
    expect(report).toContain('| Index against MySQL | **not clean**, see below |');
  });

  it('carries the narrative over, and marks it missing otherwise', () => {
    expect(renderSemanticReport(run({ narrative: 'BM25 found the flats.' }))).toContain(
      `${NARRATIVE_HEADING}\n\nBM25 found the flats.\n`,
    );
    expect(renderSemanticReport(run())).toContain('_Not written yet._');
  });
});
