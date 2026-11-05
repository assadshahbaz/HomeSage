const FENCED_BLOCK = /```[a-z]*\s*\n?([\s\S]*?)```/i;
// Anchored to a line start, so "with" in a sentence of prose is not mistaken for a CTE.
const STATEMENT_START = /^[ \t]*(SELECT|WITH)\b/im;

/**
 * Pulls the SQL out of a model reply that may wrap it in a code fence or open
 * with a sentence of prose. It only ever trims text away from the front and
 * around a fence, never inside the statement: a reply of `SELECT ...; DROP ...`
 * reaches the validator whole, so the second statement is rejected rather than
 * quietly cut off and forgotten.
 */
export function extractSql(reply: string): string {
  const fenced = FENCED_BLOCK.exec(reply);
  const body = fenced ? fenced[1] : reply;
  const start = STATEMENT_START.exec(body);
  return (start ? body.slice(start.index) : body).trim();
}
