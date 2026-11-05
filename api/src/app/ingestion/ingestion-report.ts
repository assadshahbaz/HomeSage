import type { IngestionSummary } from './ingestion.service.js';

const MS_PER_SECOND = 1000;
// Enough precision for a fraction of a cent, as the embedding logs use.
const COST_DECIMALS = 6;
// Enough to see what went wrong without flooding the terminal; the full list stays in Redis.
const DEAD_LETTERS_SHOWN = 10;

/** The end of run summary a person reads in the terminal. */
export function formatIngestionSummary(summary: IngestionSummary): string {
  const lines = [
    'Ingestion summary',
    `  started           ${started(summary)}`,
    `  documents read    ${String(summary.read)}`,
    `  documents written ${String(summary.written)}`,
    `  documents failed  ${String(summary.failed)}`,
    `  in the index      ${String(summary.indexed)}`,
    `  duration          ${(summary.durationMs / MS_PER_SECOND).toFixed(1)} s`,
    `  embedding calls   ${String(summary.embedding.calls)}`,
    `  embedding tokens  ${String(summary.embedding.inputTokens)}`,
    `  embedding cost    $${summary.embedding.costUsd.toFixed(COST_DECIMALS)} at list price`,
    `  next --since      ${nextSince(summary)}`,
  ];
  if (summary.deadLetters.length > 0) {
    lines.push('', `Dead letters (${String(summary.deadLetters.length)}):`);
    for (const letter of summary.deadLetters.slice(0, DEAD_LETTERS_SHOWN)) {
      lines.push(`  property ${letter.id} at ${letter.stage}: ${letter.reason}`);
    }
    if (summary.deadLetters.length > DEAD_LETTERS_SHOWN) {
      lines.push(
        `  and ${String(summary.deadLetters.length - DEAD_LETTERS_SHOWN)} more, kept in Redis`,
      );
    }
  }
  return lines.join('\n');
}

function started(summary: IngestionSummary): string {
  if (summary.since !== null) {
    return `with properties changed at or after ${summary.since.toISOString()}`;
  }
  return summary.resumedAfterId === null
    ? 'from the beginning'
    : `after property ${String(summary.resumedAfterId)}, resuming a stopped run`;
}

function nextSince(summary: IngestionSummary): string {
  return summary.nextSince === null
    ? 'unknown, as the resumed run recorded none; a run with --full --restart gives one'
    : summary.nextSince.toISOString();
}
