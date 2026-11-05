/**
 * Whitespace collapsed and trimmed, with null and undefined read as empty. Every
 * cleaning rule starts from this, so the same source value is never read two ways.
 */
export function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}
