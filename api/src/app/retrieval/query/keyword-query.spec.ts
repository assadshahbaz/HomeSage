import { RESULT_SOURCE_FIELDS } from '../results/search-hit.js';
import { keywordQuery } from './keyword-query.js';
import { filterClauses } from './search-filters.js';

const TEXT = 'bungalow with a garden';

describe('keywordQuery', () => {
  it('scores the words against the paragraph and returns only the card fields', () => {
    expect(keywordQuery(TEXT, 8, { propertyKinds: ['residential'] })).toEqual({
      query: {
        bool: {
          must: [{ match: { text: { query: TEXT } } }],
          filter: [{ terms: { property_kind: ['residential'] } }],
        },
      },
      size: 8,
      _source: [...RESULT_SOURCE_FIELDS],
    });
  });

  it('puts the filters in the unscored filter clause, the same clauses kNN gets', () => {
    const filters = {
      propertyKinds: ['residential' as const],
      towns: ['Ellon'],
      minBedrooms: 3,
      hasGarage: true as const,
    };

    expect(keywordQuery(TEXT, 5, filters).query).toEqual({
      bool: {
        must: [{ match: { text: { query: TEXT } } }],
        filter: filterClauses(filters),
      },
    });
  });

  it('passes text that looks like query syntax as a plain value', () => {
    const text = 'town:Ellon OR price:[0 TO *] {"match_all":{}}';

    expect(keywordQuery(text, 8, { propertyKinds: ['residential'] }).query).toMatchObject({
      bool: { must: [{ match: { text: { query: text } } }] },
    });
  });
});
