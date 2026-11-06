/**
 * Turns HomeSage's written answer into something a voice can read: citation
 * markers such as `[P-1207]` and `[SQL]` are removed, along with the spaces
 * they leave before punctuation, and everything sits on one line, since Vapi
 * takes a tool result as a single flat string.
 */
export function toSpokenText(written: string): string {
  return written
    .replace(/\[(?:P-\d+|SQL)\]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?)])/g, '$1')
    .trim();
}
