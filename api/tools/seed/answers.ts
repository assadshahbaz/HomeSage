/**
 * Cleaning rules for seller questionnaire answers. Every function here refuses
 * to invent a value: anything unclear becomes `unknown` or null rather than a
 * guess, because the answer generator later treats these columns as facts.
 */

import type { DisclosureAnswer, HeatingType } from '../../src/contracts/index.ts';
import { looksLikePhoneNumber } from './personal-data.ts';
import { cleanText } from './source-text.ts';

const MAX_SUPPLIER_LENGTH = 100;
const MAX_DETAIL_SOURCE_LENGTH = 12;
const MONTHS_PER_YEAR = 12;

const YES_WORDS = new Set(['yes', 'y', 'true', '1']);
const NO_WORDS = new Set(['no', 'n', 'false', '0', 'none', 'not connected', 'disconnected']);
const UNKNOWN_WORDS = new Set([
  'unknown',
  'not known',
  'not sure',
  'dont know',
  "don't know",
  'do not know',
  'not to my knowledge',
  'idk',
  'no/idk',
  'tbc',
]);
const NOT_APPLICABLE_WORDS = new Set(['n/a', 'na', 'not applicable', 'nil']);

export interface ParsedAnswer {
  value: DisclosureAnswer;
  /** The original sentence when it carries more than yes or no, otherwise null. */
  detail: string | null;
}

export interface AnswerOptions {
  /**
   * True for "is there a gas supply" style questions, where sellers often wrote
   * the supplier's name instead of yes. A name means the service is connected.
   */
  nameImpliesYes?: boolean;
}

/** Turns a free text questionnaire answer into yes, no, unknown or not applicable. */
export function disclosureAnswer(value: string | null, options: AnswerOptions = {}): ParsedAnswer {
  const raw = cleanText(value);
  if (raw === '') {
    return { value: 'unknown', detail: null };
  }

  const text = raw
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[.!]+$/, '');
  const detail = raw.length > MAX_DETAIL_SOURCE_LENGTH ? raw : null;

  if (YES_WORDS.has(text)) {
    return { value: 'yes', detail: null };
  }
  if (NO_WORDS.has(text)) {
    return { value: 'no', detail: null };
  }
  if (UNKNOWN_WORDS.has(text)) {
    return { value: 'unknown', detail: null };
  }
  if (NOT_APPLICABLE_WORDS.has(text)) {
    return { value: 'not_applicable', detail: null };
  }

  if (/^yes\b/.test(text)) {
    return { value: 'yes', detail };
  }
  if (/^no\b/.test(text)) {
    return { value: 'no', detail };
  }
  for (const phrase of UNKNOWN_WORDS) {
    if (text.startsWith(phrase)) {
      return { value: 'unknown', detail };
    }
  }

  // A sentence that answers neither way, such as a supplier name or a note.
  return { value: options.nameImpliesYes ? 'yes' : 'unknown', detail };
}

const HEATING_PATTERNS: [RegExp, HeatingType][] = [
  [/gas|gch|mains/i, 'gas'],
  [/oil|kerosene/i, 'oil'],
  [/electric|storage heater|air source|heat pump|solar/i, 'electric'],
  [/none|no heating|n\/a/i, 'none'],
];

/** Buckets the many spellings of heating type into five values. */
export function heatingType(value: string | null): HeatingType | null {
  const text = cleanText(value).toLowerCase();
  if (text === '') {
    return null;
  }
  for (const [pattern, mapped] of HEATING_PATTERNS) {
    if (pattern.test(text)) {
      return mapped;
    }
  }
  return 'other';
}

/** Length of ownership in months where the wording allows it, otherwise null. */
export function ownershipMonths(value: string | null): number | null {
  const text = cleanText(value).toLowerCase();
  if (text === '') {
    return null;
  }

  const years = /(\d+)\s*(?:years?|yrs?)/.exec(text);
  const months = /(\d+)\s*(?:months?|mths?)/.exec(text);
  if (years?.[1] || months?.[1]) {
    const yearPart = years?.[1] ? Number.parseInt(years[1], 10) * MONTHS_PER_YEAR : 0;
    const monthPart = months?.[1] ? Number.parseInt(months[1], 10) : 0;
    return yearPart + monthPart;
  }

  // "Since 1997" and bare years are a start date, not a duration. The seed
  // does not convert them, because that would need a sale date the data lacks.
  return null;
}

/** Supplier name, or null when the answer is really a yes, a no or a phone number. */
export function supplierName(value: string | null): string | null {
  const text = cleanText(value);
  if (text === '' || looksLikePhoneNumber(text)) {
    return null;
  }
  const lower = text.toLowerCase();
  if (
    YES_WORDS.has(lower) ||
    NO_WORDS.has(lower) ||
    UNKNOWN_WORDS.has(lower) ||
    NOT_APPLICABLE_WORDS.has(lower)
  ) {
    return null;
  }
  return text.slice(0, MAX_SUPPLIER_LENGTH);
}
