/**
 * Words that mark a missing fact, or a bug that printed one. None of them may
 * appear in a document, whether the template wrote it or a seller did.
 */
export const FORBIDDEN_WORD = /\b(null|undefined|unknown|n\/a|nan)\b/i;

// A detail that only repeats the answer adds nothing to the phrase for that answer.
const BARE_ANSWER = /^(yes|no)\W*$/i;
const CLOSING_PUNCTUATION = /[.!?]$/;

/**
 * A seller's free text as one tidy sentence: trimmed, whitespace collapsed,
 * capitalised and closed with a full stop. `null` when there is nothing worth
 * writing, including text that is only "Yes" or "No" and text containing a
 * forbidden word, so the caller falls back to its own phrase.
 */
export function sellerSentence(value: string | null): string | null {
  const collapsed = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (collapsed === '' || BARE_ANSWER.test(collapsed) || FORBIDDEN_WORD.test(collapsed)) {
    return null;
  }
  const capitalised = collapsed.charAt(0).toUpperCase() + collapsed.slice(1);
  return CLOSING_PUNCTUATION.test(capitalised) ? capitalised : `${capitalised}.`;
}
