import { NARRATIVE_HEADING } from './render-semantic-report.ts';

/** How one zero match golden question was answered. */
export interface ZeroMatchResult {
  readonly question: string;
  readonly intent: string;
  /** Why the router's reading was replaced with plain hybrid search, or null when it was used. */
  readonly fallback: string | null;
  /** Rows the golden reference query returns now. Must be 0, or the entry no longer tests anything. */
  readonly referenceRows: number;
  /** The `retrieval` event as `kind` or `kind: reason`, or `none sent` when there was none. */
  readonly retrieval: string;
  /** The whole streamed reply. */
  readonly reply: string;
  /** True when the reply is the fixed no match message for the filters the router applied. */
  readonly fixedMessage: boolean;
  readonly citations: number;
  /** Calls made to the answer model. Must be 0. */
  readonly answerCalls: number;
}

/** Everything one zero matches eval run produced, for the report. */
export interface ZeroMatchesEvalRun {
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly provider: string;
  readonly routerModel: string;
  readonly sqlModel: string;
  readonly results: readonly ZeroMatchResult[];
  /** The hand written section, carried over from the report this run replaces. */
  readonly narrative: string | null;
}

const MS_PER_SECOND = 1000;

/** True when the question was answered as a no match with no model call and no citation. */
export function isPassed(result: ZeroMatchResult): boolean {
  return (
    result.referenceRows === 0 &&
    result.retrieval === 'none: no_match' &&
    result.fixedMessage &&
    result.citations === 0 &&
    result.answerCalls === 0
  );
}

/** The zero matches report: whether each question no listing meets was answered as one. */
export function renderZeroMatchesReport(run: ZeroMatchesEvalRun): string {
  const passed = run.results.filter(isPassed).length;
  return [
    '# M3 zero matches eval',
    '',
    `Written by \`npm run evals\` on ${run.finishedAt.toISOString()}. Every question in the golden set's zero matches slice went through \`ChatService\` on the real app, with the answer model watched for calls. Each golden reference query was run again first, through the validator, to confirm it still returns no rows.`,
    '',
    '## Configuration',
    '',
    '| Setting | Value |',
    '|---------|-------|',
    `| Provider | ${run.provider} |`,
    `| Router model | ${run.routerModel} |`,
    `| SQL model | ${run.sqlModel} |`,
    `| Questions | ${String(run.results.length)} |`,
    `| Run time | ${String(Math.round(run.durationMs / MS_PER_SECOND))} s |`,
    '',
    '## Summary',
    '',
    `Answered as a no match, with no answer model call and no citation: ${String(passed)} of ${String(run.results.length)}.`,
    '',
    NARRATIVE_HEADING,
    '',
    run.narrative ?? '_Not written yet._',
    '',
    '## Every question',
    '',
    '| Question | Intent | Fallback | Reference rows | Retrieval | Fixed message | Citations | Answer calls | Passed |',
    '|----------|--------|----------|----------------|-----------|---------------|-----------|--------------|--------|',
    ...run.results.map(
      (result) =>
        `| ${result.question} | ${result.intent} | ${result.fallback ?? 'none'} | ${String(result.referenceRows)} | ${result.retrieval} | ${result.fixedMessage ? 'yes' : 'no'} | ${String(result.citations)} | ${String(result.answerCalls)} | ${isPassed(result) ? 'yes' : '**no**'} |`,
    ),
    '',
    '## Replies',
    '',
    ...run.results.flatMap((result) => [`**${result.question}**`, '', `> ${result.reply}`, '']),
  ].join('\n');
}
