import { NARRATIVE_HEADING } from './render-semantic-report.ts';

/** What one question's retrieval did with the router's filters. */
export interface FilterResult {
  readonly question: string;
  readonly source: string;
  readonly intent: string;
  /** Why the router's reading was replaced with plain hybrid search, or null when it was used. */
  readonly fallback: string | null;
  /** Each retrieval branch that gave no list, as `branch: reason`. */
  readonly failures: readonly string[];
  /** The filters the router set, defaults left out. */
  readonly filters: readonly string[];
  readonly returned: number;
  /** Properties a branch found outside the filters, dropped before the cut, as `id branch: filters`. */
  readonly caught: readonly string[];
  /** Returned properties that fail a filter when checked again. Must be empty. */
  readonly leaked: readonly string[];
}

/** Everything one filters eval run produced, for the report. */
export interface FiltersEvalRun {
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly provider: string;
  readonly routerModel: string;
  readonly sqlModel: string;
  readonly results: readonly FilterResult[];
  /** The hand written section, carried over from the report this run replaces. */
  readonly narrative: string | null;
}

const MS_PER_SECOND = 1000;

function list(items: readonly string[]): string {
  return items.length === 0 ? 'none' : items.join('; ');
}

/** The filters report: what each branch found outside the router's filters, and that none of it was returned. */
export function renderFiltersReport(run: FiltersEvalRun): string {
  const leaked = run.results.reduce((sum, result) => sum + result.leaked.length, 0);
  const caught = run.results.reduce((sum, result) => sum + result.caught.length, 0);
  const questionsCaught = run.results.filter((result) => result.caught.length > 0).length;
  const fellBack = run.results.filter((result) => result.fallback !== null).length;
  return [
    '# M3 filters eval',
    '',
    `Written by \`npm run evals\` on ${run.finishedAt.toISOString()}. Every question went through the router and hybrid retrieval on the real app, with no answer call. Each returned property was then read again from MySQL and checked against the router's filters.`,
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
    '| Measure | Result |',
    '|---------|--------|',
    `| Returned properties that fail a filter | ${String(leaked)} |`,
    `| Properties caught outside the filters and dropped | ${String(caught)}, in ${String(questionsCaught)} questions |`,
    `| Router fallbacks, which test no filter | ${String(fellBack)} |`,
    '',
    NARRATIVE_HEADING,
    '',
    run.narrative ?? '_Not written yet._',
    '',
    '## Every question',
    '',
    '| Question | Source | Intent | Fallback | Filters | Returned | Failed branches | Caught and dropped | Failing a filter |',
    '|----------|--------|--------|----------|---------|----------|-----------------|--------------------|------------------|',
    ...run.results.map(
      (result) =>
        `| ${result.question} | ${result.source} | ${result.intent} | ${result.fallback ?? 'none'} | ${list(result.filters)} | ${String(result.returned)} | ${list(result.failures)} | ${list(result.caught)} | ${result.leaked.length === 0 ? 'none' : `**${result.leaked.join('; ')}**`} |`,
    ),
    '',
  ].join('\n');
}
