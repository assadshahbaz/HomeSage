import type { estypes } from '@elastic/elasticsearch';
import type { SearchFilters } from '../../../contracts/index.js';
import { RESULT_SOURCE_FIELDS } from '../results/search-hit.js';
import { filterClauses } from './search-filters.js';

/**
 * The BM25 search for a query's words. The text goes in as the value of one
 * `match`, so nothing in it is read as query syntax, and any of its words can
 * match: a long question rarely has every word in one listing. The filters sit
 * in `filter`, so they limit the matches without scoring them.
 */
export function keywordQuery(
  text: string,
  topK: number,
  filters: SearchFilters,
): Pick<estypes.SearchRequest, 'query' | 'size' | '_source'> {
  return {
    query: {
      bool: {
        must: [{ match: { text: { query: text } } }],
        filter: filterClauses(filters),
      },
    },
    size: topK,
    _source: [...RESULT_SOURCE_FIELDS],
  };
}
