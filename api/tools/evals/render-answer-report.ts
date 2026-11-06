import { NARRATIVE_HEADING } from './render-semantic-report.ts';

/** One question answered end to end, with what the answer cited against what it was given. */
export interface AnswerResult {
  /** What the question stands for: structured, semantic, hybrid, or a question the data cannot answer. */
  readonly label: string;
  readonly question: string;
  /** The intent the router chose, or how the route was set when the router was skipped. */
  readonly routedAs: string;
  /** The property ids in the context, or empty for an aggregate or no match. */
  readonly contextIds: readonly string[];
  readonly answer: string;
  readonly citedIds: readonly string[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly firstTokenMs: number;
  readonly totalMs: number;
}

/** Everything one answer eval run produced, for the report. */
export interface AnswerEvalRun {
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly provider: string;
  readonly answerModel: string;
  readonly prompt: string;
  readonly results: readonly AnswerResult[];
  /** The hand written section, carried over from the report this run replaces. */
  readonly narrative: string | null;
}

const MS_PER_SECOND = 1000;

/** The cited ids the context did not hold. Empty when every citation is grounded. */
export function uncitedIds(result: AnswerResult): string[] {
  return result.citedIds.filter((id) => !result.contextIds.includes(id));
}

function list(ids: readonly string[]): string {
  return ids.length === 0 ? 'none' : ids.map((id) => `P-${id}`).join(', ');
}

/** The answer report: each answer in full, with its citations checked against its context. */
export function renderAnswerReport(run: AnswerEvalRun): string {
  const grounded = run.results.filter((result) => uncitedIds(result).length === 0).length;
  return [
    '# M3 answer eval',
    '',
    `Written by \`npm run evals\` on ${run.finishedAt.toISOString()}. Each question went through the router, hybrid retrieval and the answer model on the real app, against the Docker MySQL and Elasticsearch. The answers are raw model text: the citation guard is not applied yet.`,
    '',
    '## Configuration',
    '',
    '| Setting | Value |',
    '|---------|-------|',
    `| Provider | ${run.provider} |`,
    `| Answer model | ${run.answerModel} |`,
    `| Prompt | ${run.prompt} |`,
    `| Questions | ${String(run.results.length)} |`,
    `| Run time | ${String(Math.round(run.durationMs / MS_PER_SECOND))} s |`,
    '',
    '## Summary',
    '',
    '| Question | Routed as | In context | Cited | Cited outside the context | First token ms | Total ms |',
    '|----------|-----------|------------|-------|---------------------------|----------------|----------|',
    ...run.results.map(
      (result) =>
        `| ${result.label} | ${result.routedAs} | ${String(result.contextIds.length)} | ${String(result.citedIds.length)} | ${list(uncitedIds(result))} | ${String(result.firstTokenMs)} | ${String(result.totalMs)} |`,
    ),
    '',
    `Every citation in the context: ${String(grounded)} of ${String(run.results.length)} answers.`,
    '',
    NARRATIVE_HEADING,
    '',
    run.narrative ?? '_Not written yet._',
    '',
    '## Answers',
    '',
    ...run.results.flatMap((result) => [
      `### ${result.label}`,
      '',
      `**Question:** ${result.question}`,
      '',
      `**Context:** ${list(result.contextIds)}. **Cited:** ${list(result.citedIds)}. **Tokens:** ${String(result.inputTokens)} in, ${String(result.outputTokens)} out.`,
      '',
      ...result.answer.split('\n').map((line) => (line === '' ? '' : `> ${line}`)),
      '',
    ]),
  ].join('\n');
}
