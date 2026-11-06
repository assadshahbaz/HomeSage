import { RESULT_SOURCE_FIELDS } from '../results/search-hit.js';
import { filterClauses } from './search-filters.js';
import { semanticQuery } from './semantic-query.js';

const VECTOR = [0.1, 0.2, 0.3];

describe('semanticQuery', () => {
  it('asks for topK neighbours of the vector among enough candidates, and only the card fields', () => {
    expect(semanticQuery(VECTOR, 8, { propertyKinds: ['residential'] })).toEqual({
      knn: {
        field: 'embedding',
        query_vector: VECTOR,
        k: 8,
        num_candidates: 100,
        filter: [{ terms: { property_kind: ['residential'] } }],
      },
      size: 8,
      _source: [...RESULT_SOURCE_FIELDS],
    });
  });

  it('raises the candidates with topK, never below 100', () => {
    const knn = semanticQuery(VECTOR, 20, { propertyKinds: ['residential'] }).knn;

    expect(knn).toMatchObject({ k: 20, num_candidates: 200 });
  });

  it('never returns the stored vector', () => {
    expect(RESULT_SOURCE_FIELDS).not.toContain('embedding');
  });

  it('puts every filter inside the kNN search, so neighbours are found among matches only', () => {
    const filters = {
      propertyKinds: ['residential' as const],
      maxPrice: 200_000,
      hasGarden: true as const,
    };

    expect(semanticQuery(VECTOR, 8, filters).knn).toMatchObject({ filter: filterClauses(filters) });
  });
});
