import type { GoldenSelection } from './golden-set.ts';
import type { RecallScore } from './score-recall.ts';

/** How one golden question did through `POST /search/semantic`. */
export interface SemanticQuestionResult {
  readonly id: string;
  readonly category: string;
  readonly question: string;
  readonly relevant: number;
  readonly uncertain: number;
  readonly atTopK: RecallScore;
  readonly atMax: RecallScore;
}

/** Warm round trips through `POST /search/semantic`, in milliseconds. */
export interface LatencySample {
  readonly calls: number;
  readonly topK: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

/** One ingestion run as the report shows it. */
export interface IngestionRun {
  readonly label: string;
  readonly read: number;
  readonly written: number;
  readonly failed: number;
  readonly durationMs: number;
  readonly embeddingCalls: number;
  readonly inputTokens: number;
  readonly costUsd: number;
  readonly check: IndexCheck;
}

/** The index against MySQL: every property once, and nothing else. */
export interface IndexCheck {
  readonly mysqlRows: number;
  readonly indexed: number;
  /** MySQL ids with no document. */
  readonly missing: readonly number[];
  /** Documents with no MySQL row, or held more than once. */
  readonly extra: readonly string[];
}

/** Everything one semantic eval run produced, for the report. */
export interface SemanticEvalRun {
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly embeddingProvider: string;
  readonly embeddingModel: string;
  readonly dimensions: number;
  readonly inputUsdPerMillion: number;
  readonly index: string;
  readonly topK: number;
  readonly maxTopK: number;
  readonly latencyLimitMs: number;
  readonly selection: GoldenSelection;
  readonly questions: readonly SemanticQuestionResult[];
  readonly latency: LatencySample;
  /** Null when the run scored the index as it was, without ingesting. */
  readonly ingestion: readonly IngestionRun[] | null;
  /** The index as the questions were scored on it. */
  readonly check: IndexCheck;
  /** The hand written section, carried over from the report this run replaces. */
  readonly narrative: string | null;
}

const PERCENT = 100;
const MS_PER_SECOND = 1000;
const COST_DECIMALS = 4;
const SHOWN_IDS = 10;
export const NARRATIVE_HEADING = '## What it shows';

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function percent(fraction: number): string {
  return `${String(Math.round(fraction * PERCENT))} percent`;
}

function score({ found, possible }: RecallScore): string {
  return `${String(found)} of ${String(possible)}`;
}

function mean(scores: readonly RecallScore[]): number {
  return scores.length === 0
    ? 0
    : scores.reduce((sum, recall) => sum + recall.recall, 0) / scores.length;
}

/** No property missing, none extra, and as many documents as rows. */
export function isClean(check: IndexCheck): boolean {
  return (
    check.missing.length === 0 && check.extra.length === 0 && check.indexed === check.mysqlRows
  );
}

function describeCheck(check: IndexCheck): string {
  const parts = [`${String(check.indexed)} documents for ${String(check.mysqlRows)} MySQL rows`];
  for (const [name, ids] of [
    ['missing', check.missing.map(String)],
    ['extra or repeated', check.extra],
  ] as const) {
    if (ids.length > 0) {
      const shown = ids.slice(0, SHOWN_IDS).join(', ');
      parts.push(`${String(ids.length)} ${name}: ${shown}${ids.length > SHOWN_IDS ? ', ...' : ''}`);
    }
  }
  return `${parts.join('; ')}. ${isClean(check) ? 'Every property once' : '**Not clean**'}`;
}

/**
 * The text under `heading` in an earlier report, up to the next heading of the
 * same level, so a rerun keeps what a person wrote there. Null when the
 * heading is missing or has nothing under it.
 */
export function extractSection(markdown: string, heading: string): string | null {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) {
    return null;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return body === '' ? null : body;
}

/** The markdown report for one run, committed as `workbench/evals/reports/m2.md`. */
export function renderSemanticReport(run: SemanticEvalRun): string {
  const atTopK = mean(run.questions.map((question) => question.atTopK));
  const atMax = mean(run.questions.map((question) => question.atMax));
  const checks = [...(run.ingestion ?? []).map((ingestion) => ingestion.check), run.check];
  const indexClean = checks.every(isClean);
  const fastEnough = run.latency.p95Ms < run.latencyLimitMs;
  const topK = String(run.topK);
  const maxTopK = String(run.maxTopK);

  const lines = [
    '# M2 semantic retrieval eval',
    '',
    `Written by \`npm run evals\` on ${run.finishedAt.toISOString()}. Every question went through \`POST /search/semantic\` on the real app, against the Docker Elasticsearch and the configured embedding model.`,
    '',
    '## Configuration',
    '',
    '| Setting | Value |',
    '|---------|-------|',
    `| Embedding provider | ${run.embeddingProvider} |`,
    `| Embedding model | \`${run.embeddingModel}\`, ${String(run.dimensions)} dimensions |`,
    `| Price per million input tokens | $${String(run.inputUsdPerMillion)} |`,
    `| Index | \`${run.index}\` |`,
    `| Golden set entries | milestones ${run.selection.milestones.join(', ')}; slices ${run.selection.slices.map((slice) => `\`${slice}\``).join(', ')} |`,
    '',
    '## Result',
    '',
    '| Measure | Value |',
    '|---------|-------|',
    `| Mean recall at ${topK} | **${percent(atTopK)}** |`,
    `| Mean recall at ${maxTopK} | ${percent(atMax)} |`,
    `| Warm latency, top ${String(run.latency.topK)} | p50 **${String(run.latency.p50Ms)} ms**, p95 **${String(run.latency.p95Ms)} ms**, max ${String(run.latency.maxMs)} ms over ${String(run.latency.calls)} calls; ${fastEnough ? 'under' : '**not under**'} ${String(run.latencyLimitMs)} ms at p95 |`,
    `| Index against MySQL | ${indexClean ? `every property once${run.ingestion === null ? '' : ' after every run'}` : '**not clean**, see below'} |`,
    `| Duration | ${String(Math.round(run.durationMs / MS_PER_SECOND))} s |`,
    '',
    '## Recall per question',
    '',
    `Each question asked for the top ${maxTopK}. Recall at ${topK} is what the product's default top ${topK} would have shown.`,
    '',
    `| Question | Category | Relevant | Uncertain | Recall at ${topK} | Recall at ${maxTopK} |`,
    '|----------|----------|----------|-----------|-----------|------------|',
    ...run.questions.map(
      (question) =>
        `| ${cell(question.question)} | ${cell(question.category)} | ${String(question.relevant)} | ${String(question.uncertain)} | ${score(question.atTopK)} | ${score(question.atMax)} |`,
    ),
    '',
    '## Ingestion',
    '',
    ...(run.ingestion === null
      ? [
          'Not run this time: the questions were scored on the index as it was. Set `EVAL_REINGEST=1` for a full run and a rerun.',
        ]
      : [
          'A full run from the first property, then the same again, with the index checked against MySQL after each.',
          '',
          '| Run | Read | Written | Failed | Duration | Embedding calls | Tokens | Cost | Index |',
          '|-----|------|---------|--------|----------|-----------------|--------|------|-------|',
          ...run.ingestion.map(
            (ingestion) =>
              `| ${ingestion.label} | ${String(ingestion.read)} | ${String(ingestion.written)} | ${String(ingestion.failed)} | ${String(Math.round(ingestion.durationMs / MS_PER_SECOND))} s | ${String(ingestion.embeddingCalls)} | ${String(ingestion.inputTokens)} | $${ingestion.costUsd.toFixed(COST_DECIMALS)} | ${describeCheck(ingestion.check)} |`,
          ),
        ]),
    '',
    '## Index as scored',
    '',
    describeCheck(run.check),
    '',
    NARRATIVE_HEADING,
    '',
    run.narrative ?? '_Not written yet._',
    '',
    '## How it is scored',
    '',
    `Questions come from \`workbench/evals/golden-set.json\`, picked by the milestones and slices above, each labelled by hand from a pool of candidates as \`workbench/evals/README.md\` describes. A question's recall at k is the relevant properties found in its top k, divided by k or by the number of relevant properties, whichever is smaller, so a perfect top k scores 100 percent. Uncertain properties, which the record points to but cannot prove, are taken out of the results before the cut: finding one neither earns a hit nor uses up a slot. The API returns at most ${maxTopK}, so a question with an uncertain property in its top ${maxTopK} is judged on fewer at ${maxTopK}.`,
    '',
    `Latency is the round trip of \`POST /search/semantic\` inside the process, after every question has been asked once, so the model and the index are warm. The questions are asked in turn until the sample is full.`,
    '',
    'The index check lists every document id in the index and every property id in MySQL. A property with no document is missing; a document with no property, or an id held twice, is extra.',
    '',
  ];
  return lines.join('\n');
}
