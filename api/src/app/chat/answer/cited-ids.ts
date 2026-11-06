const PROPERTY_MARKER = /\[P-(\d+)\]/g;

/**
 * The property ids an answer cites, each once, in order of first appearance.
 * Only a complete `[P-<digits>]` marker counts; `[SQL]` and look alikes do not.
 */
export function citedPropertyIds(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(PROPERTY_MARKER), (match) => match[1]))];
}
