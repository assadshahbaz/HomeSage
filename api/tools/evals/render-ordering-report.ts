import { NARRATIVE_HEADING } from './render-semantic-report.ts';

/** How one aggregate or ordered golden question went, from retrieval path to answer. */
export interface OrderingResult {
  readonly question: string;
  /** What the golden set expects: an aggregate, or rows in an order. */
  readonly expected: 'aggregate' | 'ordered rows';
  readonly intent: string;
  /** The path retrieval took, or `declined` when the router declined. */
  readonly ranking: string;
  /** What retrieval returned against the reference query's rows. */
  readonly retrieval: { readonly passed: boolean; readonly reason: string };
  /** What the answer cited: `SQL`, property ids, or nothing. */
  readonly cited: string;
  /** True when the citations fit the path: `[SQL]` alone for an aggregate, ids in retrieval order for rows. */
  readonly citationsFit: boolean;
}

/** Everything one ordering eval run produced, for the report. */
export interface OrderingEvalRun {
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly provider: string;
  readonly answerModel: string;
  readonly results: readonly OrderingResult[];
  /** The hand written section, carried over from the report this run replaces. */
  readonly narrative: string | null;
}

const MS_PER_SECOND = 1000;

/** True when the path matches what the question needs and both checks pass. */
export function isCorrect(result: OrderingResult): boolean {
  const path = result.expected === 'aggregate' ? 'aggregate' : 'sql_order';
  return result.ranking === path && result.retrieval.passed && result.citationsFit;
}

/** The aggregates and ordering report: the path each question took and whether its answer held. */
export function renderOrderingReport(run: OrderingEvalRun): string {
  const correct = run.results.filter(isCorrect).length;
  return [
    '# M3 aggregates and ordering eval',
    '',
    `Written by \`npm run evals\` on ${run.finishedAt.toISOString()}. Every question in the golden set's aggregates and ordering slice went through the router, hybrid retrieval and the guarded answer on the real app. Retrieval is scored against the golden reference query with the M1 row scorer, in order for an ordered question.`,
    '',
    '## Configuration',
    '',
    '| Setting | Value |',
    '|---------|-------|',
    `| Provider | ${run.provider} |`,
    `| Answer model | ${run.answerModel} |`,
    `| Questions | ${String(run.results.length)} |`,
    `| Run time | ${String(Math.round(run.durationMs / MS_PER_SECOND))} s |`,
    '',
    '## Summary',
    '',
    `Correct path, retrieval and citations: ${String(correct)} of ${String(run.results.length)}.`,
    '',
    NARRATIVE_HEADING,
    '',
    run.narrative ?? '_Not written yet._',
    '',
    '## Every question',
    '',
    '| Question | Expected | Intent | Path | Retrieval against the reference | Cited | Citations fit |',
    '|----------|----------|--------|------|---------------------------------|-------|---------------|',
    ...run.results.map(
      (result) =>
        `| ${result.question} | ${result.expected} | ${result.intent} | ${result.ranking} | ${result.retrieval.passed ? 'pass' : '**fail**'}: ${result.retrieval.reason} | ${result.cited} | ${result.citationsFit ? 'yes' : '**no**'} |`,
    ),
    '',
  ].join('\n');
}
