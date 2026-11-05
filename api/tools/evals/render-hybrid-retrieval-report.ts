import { NARRATIVE_HEADING } from './render-semantic-report.ts';
import type { RecallScore } from './score-recall.ts';

/** How one semantic slice question did once fused. */
export interface FusedRecallResult {
  readonly question: string;
  readonly fused: RecallScore;
}

/** What one hybrid question retrieved, and from where. */
export interface HybridCaseResult {
  readonly question: string;
  readonly intent: string;
  readonly properties: number;
  readonly unique: number;
  /** How many of the properties each branch placed, so overlaps count in each. */
  readonly fromSql: number;
  readonly fromKnn: number;
  readonly fromBm25: number;
  /** Branch and reason for each branch that gave no list. */
  readonly failures: readonly string[];
  readonly totalMs: number;
}

/** Everything one hybrid retrieval eval run produced, for the report. */
export interface HybridRetrievalEvalRun {
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly provider: string;
  readonly sqlModel: string;
  readonly routerModel: string;
  readonly embeddingModel: string;
  readonly branchTimeoutMs: number;
  readonly topK: number;
  readonly semantic: readonly FusedRecallResult[];
  readonly hybrid: readonly HybridCaseResult[];
  /** The hand written section, carried over from the report this run replaces. */
  readonly narrative: string | null;
}

const PERCENT = 100;
const MS_PER_SECOND = 1000;

function total(scores: readonly RecallScore[]): string {
  const found = scores.reduce((sum, score) => sum + score.found, 0);
  const possible = scores.reduce((sum, score) => sum + score.possible, 0);
  const percent = possible === 0 ? 0 : Math.round((found / possible) * PERCENT);
  return `${String(found)} of ${String(possible)} (${String(percent)} percent)`;
}

/** True when a hybrid question got a full, unique top k drawn from SQL and from a search. */
export function isFullAndMixed(result: HybridCaseResult, topK: number): boolean {
  return (
    result.properties === topK &&
    result.unique === topK &&
    result.fromSql > 0 &&
    result.fromKnn + result.fromBm25 > 0
  );
}

/**
 * The hybrid retrieval report: fused recall at k on the semantic slice, and
 * what each hybrid case retrieved and from which branch.
 */
export function renderHybridRetrievalReport(run: HybridRetrievalEvalRun): string {
  const k = String(run.topK);
  const mixed = run.hybrid.filter((result) => isFullAndMixed(result, run.topK)).length;
  return [
    '# M3 hybrid retrieval eval',
    '',
    `Written by \`npm run evals\` on ${run.finishedAt.toISOString()}. Semantic questions went through \`HybridRetrievalService\` routed as semantic, with no model call. Hybrid questions went through the real router first, then SQL, kNN and BM25 side by side, fused with RRF.`,
    '',
    '## Configuration',
    '',
    '| Setting | Value |',
    '|---------|-------|',
    `| Provider | ${run.provider} |`,
    `| Router model | ${run.routerModel} |`,
    `| SQL model | ${run.sqlModel} |`,
    `| Embedding model | ${run.embeddingModel} |`,
    `| Branch deadline | ${String(run.branchTimeoutMs)} ms |`,
    `| Top k | ${k} |`,
    `| Run time | ${String(Math.round(run.durationMs / MS_PER_SECOND))} s |`,
    '',
    '## Summary',
    '',
    '| Measure | Result |',
    '|---------|--------|',
    `| Fused recall@${k}, semantic slice | ${total(run.semantic.map((result) => result.fused))} |`,
    `| Hybrid questions with ${k} unique properties from SQL and a search | ${String(mixed)} of ${String(run.hybrid.length)} |`,
    '',
    NARRATIVE_HEADING,
    '',
    run.narrative ?? '_Not written yet._',
    '',
    '## Hybrid questions',
    '',
    'Each column counts the properties that branch placed, so a property two branches found counts in both.',
    '',
    '| Question | Routed as | Properties | Unique | SQL | kNN | BM25 | Failed branches | ms |',
    '|----------|-----------|------------|--------|-----|-----|------|-----------------|----|',
    ...run.hybrid.map((result) =>
      [
        '',
        result.question,
        result.intent,
        String(result.properties),
        String(result.unique),
        String(result.fromSql),
        String(result.fromKnn),
        String(result.fromBm25),
        result.failures.length === 0 ? 'none' : result.failures.join(', '),
        String(result.totalMs),
        '',
      ]
        .join(' | ')
        .trim(),
    ),
    '',
    '## Semantic questions',
    '',
    `| Question | Fused recall@${k} |`,
    '|----------|-------------------|',
    ...run.semantic.map(
      (result) =>
        `| ${result.question} | ${String(result.fused.found)} of ${String(result.fused.possible)} |`,
    ),
    '',
  ].join('\n');
}
