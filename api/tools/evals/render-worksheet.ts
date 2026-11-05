import type { PoolPath } from './candidate-pool.ts';
import type { LabellingQuestion } from './labelling-questions.ts';

/** A candidate's facts as MySQL holds them, the record a label is judged on. */
export interface CandidateRecord {
  readonly address: string;
  readonly kind: string;
  readonly bedrooms: number | null;
  readonly price: number;
  /** Every feature the record states, such as "garden" or "oil heating". */
  readonly facts: readonly string[];
}

/** One pooled candidate with its record and the label its question's rule proposes. */
export interface WorksheetCandidate {
  readonly id: number;
  readonly foundBy: readonly PoolPath[];
  readonly record: CandidateRecord;
  readonly relevant: boolean;
}

export interface WorksheetQuestion {
  readonly question: LabellingQuestion;
  readonly candidates: readonly WorksheetCandidate[];
  /** How many each path returned before merging. */
  readonly pathCounts: Readonly<Record<PoolPath, number>>;
}

export interface Worksheet {
  readonly milestone: string;
  readonly generatedAt: string;
  readonly embeddingModel: string;
  readonly questions: readonly WorksheetQuestion[];
}

const PRICE = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

/**
 * The page a reviewer reads before labels go into the golden set: per
 * question, its rule and every pooled candidate with the facts its record
 * holds and the label the rule proposes.
 */
export function renderWorksheet(worksheet: Worksheet): string {
  const lines = [
    `# ${worksheet.milestone} labelling worksheet`,
    '',
    `Written by \`npm run evals:pool\` on ${worksheet.generatedAt}, following the pooling method in \`workbench/evals/README.md\`: the top 20 from SQL (the question's rule), BM25 over the document text and kNN over the embeddings (\`${worksheet.embeddingModel}\`), residential only, merged without repeats.`,
    '',
    "Each candidate's facts are read from its MySQL record, not the index. The proposed label is the rule's verdict on that record. A reviewer confirms or changes each one before it goes into the golden set.",
    '',
    '| Question | Pool | SQL | BM25 | kNN | Proposed relevant |',
    '|----------|------|-----|------|-----|-------------------|',
    ...worksheet.questions.map(
      ({ question, candidates, pathCounts }) =>
        `| \`${question.id}\` | ${String(candidates.length)} | ${String(pathCounts.sql)} | ${String(pathCounts.bm25)} | ${String(pathCounts.knn)} | ${String(candidates.filter((candidate) => candidate.relevant).length)} |`,
    ),
  ];

  for (const [position, { question, candidates }] of worksheet.questions.entries()) {
    lines.push(
      '',
      `## ${String(position + 1)}. ${question.id}`,
      '',
      `**Question:** ${question.question}`,
      '',
      `**Category:** ${question.category}`,
      '',
      `**Rule:** \`${question.rule}\``,
      '',
      '| Id | Found by | Address | Kind | Beds | Price | Facts in MySQL | Proposed |',
      '|----|----------|---------|------|------|-------|----------------|----------|',
      ...candidates.map(({ id, foundBy, record, relevant }) =>
        [
          '',
          String(id),
          foundBy.join(', '),
          escapeCell(record.address),
          record.kind,
          record.bedrooms === null ? '' : String(record.bedrooms),
          PRICE.format(record.price),
          record.facts.join(', '),
          relevant ? '**relevant**' : 'no',
          '',
        ]
          .join(' | ')
          .trim(),
      ),
    );
  }
  return `${lines.join('\n')}\n`;
}

// A pipe in an address would end its table cell early.
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|');
}
