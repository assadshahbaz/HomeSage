import type { SearchFilters } from '../../../contracts/index.js';
import { describeFilters } from './describe-filters.js';

/**
 * The whole answer when every search ran and nothing met the question. It is
 * fixed text, so an empty context never reaches the answer model, and it names
 * the filters so the person can loosen one.
 */
export function noMatchMessage(filters: SearchFilters): string {
  const applied = describeFilters(filters);
  return applied.length === 0
    ? 'No listings in this data match your question.'
    : `No listings in this data match everything you asked for: ${applied.join(', ')}. Loosening one of these may find some.`;
}

/**
 * The whole answer when a search failed and nothing came back. Whether any
 * listing matches is unknown, so it does not say that none do.
 */
export const SEARCH_FAILED_MESSAGE =
  'I could not finish searching the listings for this question, so I cannot say whether any match. Please try again, or ask it another way.';
