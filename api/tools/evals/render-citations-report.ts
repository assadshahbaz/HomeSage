import { NARRATIVE_HEADING } from './render-semantic-report.ts';

/** How one golden question's guarded answer cited, or that the router declined it. */
export interface CitationResult {
  readonly id: string;
  readonly question: string;
  readonly intent: string;
  /** True when the router declined, so no answer was written. */
  readonly declined: boolean;
  /** The ids the turn retrieved, or empty for an aggregate turn. */
  readonly contextIds: readonly string[];
  readonly aggregate: boolean;
  readonly citedIds: readonly string[];
  readonly citedSql: boolean;
  /** Each removed marker and why, as `marker reason`. */
  readonly stripped: readonly string[];
  /** Ids in the streamed text, inside a marker or not, that the turn did not retrieve. */
  readonly leakedIds: readonly string[];
  /** Whether the streamed pieces joined equal the guarded full text. */
  readonly streamMatches: boolean;
}

/** Everything one citations eval run produced, for the report. */
export interface CitationsEvalRun {
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly provider: string;
  readonly answerModel: string;
  readonly results: readonly CitationResult[];
  /** The hand written section, carried over from the report this run replaces. */
  readonly narrative: string | null;
}

const MS_PER_SECOND = 1000;
// A property id as text, with or without its marker.
const ID_IN_TEXT = /P-(\d+)/g;

/** The ids written in `text` that are not among `allowed`, each once. */
export function idsOutside(text: string, allowed: readonly string[]): string[] {
  const found = Array.from(text.matchAll(ID_IN_TEXT), (match) => match[1]);
  return [...new Set(found.filter((id) => !allowed.includes(id)))];
}

function cited(result: CitationResult): string {
  if (result.declined) {
    return 'declined';
  }
  const parts = result.citedIds.map((id) => `P-${id}`);
  if (result.citedSql) {
    parts.push('SQL');
  }
  return parts.length === 0 ? 'none' : parts.join(', ');
}

/** The citations report: for each golden question, what the guarded answer cited and what the guard removed. */
export function renderCitationsReport(run: CitationsEvalRun): string {
  const answered = run.results.filter((result) => !result.declined);
  const leaking = answered.filter((result) => result.leakedIds.length > 0).length;
  const mismatched = answered.filter((result) => !result.streamMatches).length;
  const strippedCount = answered.reduce((sum, result) => sum + result.stripped.length, 0);
  return [
    '# M3 citations eval',
    '',
    `Written by \`npm run evals\` on ${run.finishedAt.toISOString()}. Every golden set question went through the router, hybrid retrieval and the guarded answer on the real app. Questions the router declined got no answer.`,
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
    '| Measure | Result |',
    '|---------|--------|',
    `| Answered | ${String(answered.length)} of ${String(run.results.length)} |`,
    `| Answers with an id outside the retrieval in the streamed text | ${String(leaking)} |`,
    `| Answers whose streamed text differs from the guarded text | ${String(mismatched)} |`,
    `| Markers removed by the guard | ${String(strippedCount)} |`,
    '',
    NARRATIVE_HEADING,
    '',
    run.narrative ?? '_Not written yet._',
    '',
    '## Every question',
    '',
    '| Question | Intent | Retrieved | Cited | Removed | Ids outside the retrieval | Stream matches |',
    '|----------|--------|-----------|-------|---------|---------------------------|----------------|',
    ...run.results.map((result) =>
      [
        '',
        result.question,
        result.intent,
        result.aggregate ? 'aggregate' : String(result.contextIds.length),
        cited(result),
        result.stripped.length === 0 ? 'none' : result.stripped.join('; '),
        result.leakedIds.length === 0 ? 'none' : result.leakedIds.map((id) => `P-${id}`).join(', '),
        result.declined ? '' : result.streamMatches ? 'yes' : '**no**',
        '',
      ]
        .join(' | ')
        .trim(),
    ),
    '',
  ].join('\n');
}
