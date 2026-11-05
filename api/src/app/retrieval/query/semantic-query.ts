import type { estypes } from '@elastic/elasticsearch';
import type { SearchFilters } from '../../../contracts/index.js';
import { RESULT_SOURCE_FIELDS } from '../results/search-hit.js';
import { filterClauses } from './search-filters.js';

// Candidates each shard considers per result wanted. More finds true nearest
// neighbours more reliably, at some cost in time; a few thousand documents at most make it cheap.
const CANDIDATES_PER_RESULT = 10;
const MIN_CANDIDATES = 100;

/**
 * The kNN search for a query vector. Every filter goes inside `knn.filter`, so
 * the nearest neighbours are found among matching documents only. Filtering
 * after the search instead would drop matches from a fixed top k and could
 * return fewer results than asked for, or none.
 */
export function semanticQuery(
  vector: readonly number[],
  topK: number,
  filters: SearchFilters,
): Pick<estypes.SearchRequest, 'knn' | 'size' | '_source'> {
  return {
    knn: {
      field: 'embedding',
      query_vector: [...vector],
      k: topK,
      num_candidates: Math.max(topK * CANDIDATES_PER_RESULT, MIN_CANDIDATES),
      filter: filterClauses(filters),
    },
    size: topK,
    _source: [...RESULT_SOURCE_FIELDS],
  };
}
