import type { RecallScore } from './score-recall.ts';
import { NARRATIVE_HEADING } from './render-semantic-report.ts';

/** How one golden question did in each ranking. */
export interface RankedListsQuestionResult {
  readonly id: string;
  readonly question: string;
  readonly knn: RecallScore;
  readonly bm25: RecallScore;
  readonly either: RecallScore;
}

/** Everything one ranked lists eval run produced, for the report. */
export interface RankedListsEvalRun {
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly embeddingModel: string;
  readonly index: string;
  readonly topK: number;
  readonly questions: readonly RankedListsQuestionResult[];
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

function cell(score: RecallScore): string {
  return `${String(score.found)} of ${String(score.possible)}`;
}

/**
 * The ranked lists report: recall at k for kNN alone, BM25 alone, and the two
 * top k lists together, over the golden questions with hand labelled ids.
 */
export function renderRankedListsReport(run: RankedListsEvalRun): string {
  const { questions } = run;
  const k = String(run.topK);
  return [
    '# M3 ranked lists eval',
    '',
    `Written by \`npm run evals\` on ${run.finishedAt.toISOString()}. Each question went through \`RetrievalService\` against the local Elasticsearch index and the configured embedding model, with the default filters, and both rankings were scored against the hand labelled ids.`,
    '',
    '## Configuration',
    '',
    '| Setting | Value |',
    '|---------|-------|',
    `| Embedding model | ${run.embeddingModel} |`,
    `| Index | ${run.index} |`,
    `| Top k | ${k} |`,
    `| Questions | ${String(questions.length)} |`,
    `| Run time | ${String(Math.round(run.durationMs / MS_PER_SECOND))} s |`,
    '',
    '## Summary',
    '',
    `| Ranking | Recall@${k} |`,
    '|---------|-----------|',
    `| kNN alone | ${total(questions.map((question) => question.knn))} |`,
    `| BM25 alone | ${total(questions.map((question) => question.bm25))} |`,
    `| Either top ${k} | ${total(questions.map((question) => question.either))} |`,
    '',
    `"Either" counts a relevant property found in the top ${k} of kNN, of BM25 or of both. Fusing the two lists keeps ${k} of them, so it is the most a fused top ${k} could find.`,
    '',
    NARRATIVE_HEADING,
    '',
    run.narrative ?? '_Not written yet._',
    '',
    '## Every question',
    '',
    '| Question | kNN | BM25 | Either |',
    '|----------|-----|------|--------|',
    ...questions.map(
      (question) =>
        `| ${question.question} | ${cell(question.knn)} | ${cell(question.bm25)} | ${cell(question.either)} |`,
    ),
    '',
  ].join('\n');
}
