import { cleanText } from './source-text.ts';

const MINIMUM_PHONE_DIGITS = 8;

const PHONE_PATTERN = /(?:\+?\d[\d ()-]{7,})/;

/** True when a value looks like a phone number, which must never be imported. */
export function looksLikePhoneNumber(value: string | null): boolean {
  const text = cleanText(value).replace(/[^\d+() -]/g, '');
  return PHONE_PATTERN.test(text) && text.replace(/\D/g, '').length >= MINIMUM_PHONE_DIGITS;
}

/**
 * Some sellers answered with family circumstances, naming relatives, executors,
 * solicitors and people who have died. Free text carrying any of these signs is
 * dropped rather than imported, since it would otherwise reach the search index
 * and the answers.
 */
const PERSONAL_DATA_PATTERNS = [
  /\b(mr|mrs|ms|miss|dr)\.?\s+[a-z]/i,
  /\b(deceased|passed away|executor|executrix|power of attorney|guardian|probate|estate of)\b/i,
  /\bmy\s+(husband|wife|son|daughter|mother|father|mum|dad|aunt|uncle|parents|partner|late)\b/i,
  /\b(on behalf of|next of kin)\b/i,
  /[\w.+-]+@[\w-]+\.[\w.]+/,
];

const MAX_FREE_TEXT_LENGTH = 400;

/** True when free text shows signs of naming a person or their circumstances. */
export function containsPersonalData(value: string | null): boolean {
  const text = cleanText(value);
  if (text === '') {
    return false;
  }
  return looksLikePhoneNumber(text) || PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Free text kept for search. Anything naming a person, or long enough to be a
 * story about one, is dropped: the yes/no column beside it still carries the
 * fact that matters.
 */
export function freeText(value: string | null): string | null {
  const text = cleanText(value);
  if (text === '' || text.length > MAX_FREE_TEXT_LENGTH || containsPersonalData(text)) {
    return null;
  }
  return text;
}
