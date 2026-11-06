import type { ChatIntent, RouteFallback } from '../../src/contracts/index.ts';
import { NARRATIVE_HEADING } from './render-semantic-report.ts';
import { tallyFilters } from './score-route.ts';
import type { RouteScore } from './score-route.ts';

/** How one question did through `QueryRouter`. */
export interface RouterQuestionResult {
  readonly id: string;
  /** Where the question came from: a golden set slice or a router case category. */
  readonly source: string;
  readonly question: string;
  readonly expectedIntents: readonly ChatIntent[];
  readonly intent: ChatIntent;
  /** The filters as the route carried them, by name, defaults left out. */
  readonly filters: readonly string[];
  readonly score: RouteScore;
  /** Filter values and property ids the router dropped as unknown or invalid. */
  readonly dropped: number;
  readonly fallback: RouteFallback | null;
  readonly latencyMs: number;
}

/** Everything one router eval run produced, for the report. */
export interface RouterEvalRun {
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly timeoutMs: number;
  readonly temperature: number | null;
  readonly questions: readonly RouterQuestionResult[];
  readonly narrative: string | null;
}

const PERCENT = 100;
const MS_PER_SECOND = 1000;

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function ratio(part: number, whole: number): string {
  return whole === 0
    ? 'none to score'
    : `${String(part)} of ${String(whole)} (${String(Math.round((part / whole) * PERCENT))} percent)`;
}

function list(items: readonly string[]): string {
  return items.length === 0 ? 'none' : items.join(', ');
}

function bySource(questions: readonly RouterQuestionResult[]): string[] {
  const sources = [...new Set(questions.map((question) => question.source))];
  return sources.map((source) => {
    const picked = questions.filter((question) => question.source === source);
    const right = picked.filter((question) => question.score.intentCorrect).length;
    return `| ${cell(source)} | ${String(picked.length)} | ${ratio(right, picked.length)} |`;
  });
}

function fallbackSummary(questions: readonly RouterQuestionResult[]): string {
  const counts = new Map<string, number>();
  for (const { fallback } of questions) {
    if (fallback !== null) {
      counts.set(fallback, (counts.get(fallback) ?? 0) + 1);
    }
  }
  return counts.size === 0
    ? 'none'
    : [...counts].map(([reason, count]) => `${String(count)} ${reason}`).join(', ');
}

function questionRow(question: RouterQuestionResult, index: number): string {
  const filters = question.score.filters
    .filter((filter) => filter.outcome !== 'matched')
    .map((filter) => `${filter.filter} ${filter.outcome}`);
  return [
    String(index + 1),
    cell(question.question),
    cell(question.source),
    list(question.expectedIntents),
    question.score.intentCorrect ? question.intent : `**${question.intent}**`,
    list(question.filters),
    list(filters),
    String(question.dropped),
    question.fallback ?? '',
    String(question.latencyMs),
  ].join(' | ');
}

/** The markdown report for one run, committed as `workbench/evals/reports/m3-router.md`. */
export function renderRouterReport(run: RouterEvalRun): string {
  const questions = run.questions;
  const right = questions.filter((question) => question.score.intentCorrect).length;
  const tallies = tallyFilters(questions.map((question) => question.score));
  const total = tallies.reduce(
    (sum, tally) => ({
      matched: sum.matched + tally.matched,
      wrong: sum.wrong + tally.wrong,
      missed: sum.missed + tally.missed,
      extra: sum.extra + tally.extra,
    }),
    { matched: 0, wrong: 0, missed: 0, extra: 0 },
  );
  const misses = questions.filter((question) => !question.score.intentCorrect);

  return [
    '# M3 router eval',
    '',
    `Written by \`npm run evals\` on ${run.finishedAt.toISOString()}. Every question went through \`QueryRouter\` on the real app, against the Docker MySQL and the configured router model, with no conversation history.`,
    '',
    '## Configuration',
    '',
    '| Setting | Value |',
    '|---------|-------|',
    `| Provider | ${run.provider} |`,
    `| Router model | ${run.model} |`,
    `| Prompt | ${run.prompt} |`,
    `| Router timeout | ${String(run.timeoutMs)} ms |`,
    `| Router temperature | ${run.temperature === null ? 'provider default' : String(run.temperature)} |`,
    `| Questions | ${String(questions.length)} |`,
    `| Run time | ${String(Math.round(run.durationMs / MS_PER_SECOND))} s |`,
    '',
    '## Summary',
    '',
    '| Measure | Result |',
    '|---------|--------|',
    `| Intent right | ${ratio(right, questions.length)} |`,
    `| Filter precision | ${ratio(total.matched, total.matched + total.wrong + total.extra)} |`,
    `| Filter recall | ${ratio(total.matched, total.matched + total.wrong + total.missed)} |`,
    `| Fallbacks | ${fallbackSummary(questions)} |`,
    `| Values dropped | ${String(questions.reduce((sum, question) => sum + question.dropped, 0))} |`,
    '',
    '## Intent by source',
    '',
    '| Source | Questions | Intent right |',
    '|--------|-----------|--------------|',
    ...bySource(questions),
    '',
    '## Filters',
    '',
    'Scored only on questions whose expected route lists filters, and not when the router rightly declined. Precision counts wrong and extra filters against the router, recall counts wrong and missed ones. The default property kinds are not counted.',
    '',
    '| Filter | Matched | Wrong | Missed | Extra |',
    '|--------|---------|-------|--------|-------|',
    ...tallies.map(
      (tally) =>
        `| ${tally.filter} | ${String(tally.matched)} | ${String(tally.wrong)} | ${String(tally.missed)} | ${String(tally.extra)} |`,
    ),
    '',
    '## Intent misses',
    '',
    ...(misses.length === 0
      ? ['None.']
      : [
          '| Question | Expected | Got | Fallback |',
          '|----------|----------|-----|----------|',
          ...misses.map(
            (question) =>
              `| ${cell(question.question)} | ${list(question.expectedIntents)} | ${question.intent} | ${question.fallback ?? ''} |`,
          ),
        ]),
    '',
    NARRATIVE_HEADING,
    '',
    run.narrative ?? '_Not written yet._',
    '',
    '## Every question',
    '',
    'Filters lists what the route carried, defaults left out. Filter misses lists every filter that was not matched. A wrong intent is in bold.',
    '',
    '| # | Question | Source | Expected | Got | Filters | Filter misses | Dropped | Fallback | ms |',
    '|---|----------|--------|----------|-----|---------|---------------|---------|----------|----|',
    ...questions.map((question, index) => `| ${questionRow(question, index)} |`),
    '',
    '## How it is scored',
    '',
    '* Questions come from every golden set entry, each with an expected `route`, and from `workbench/evals/router/router-cases.json`, which holds hybrid, out of scope and unknown value cases the golden set does not have yet.',
    '* The intent is right when it is one of the acceptable intents. Some questions fairly fit more than one, such as a descriptive question that maps onto one column.',
    '* A fallback counts as the router reading the question as hybrid. Provider failures are retried once after a pause, so a fallback in the report survived that retry.',
    '',
  ].join('\n');
}
