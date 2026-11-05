import { semanticSearchResponseSchema } from '../../contracts/index.js';
import type { SearchResult, SemanticSearchRequest } from '../../contracts/index.js';
import { SearchController } from './search.controller.js';
import type { SemanticSearchService } from './semantic-search.service.js';

const REQUEST: SemanticSearchRequest = {
  query: 'cosy flat with a garden and a quiet street',
  topK: 8,
  filters: { propertyKinds: ['residential'], hasGarden: true },
};

const RESULT: SearchResult = {
  id: '3501',
  score: 0.827,
  price: 80_000,
  bedrooms: 2,
  bathrooms: 1,
  publicRooms: 1,
  areaM2: null,
  town: 'Aberdeen',
  postcodeDistrict: 'AB24',
  postCode: 'AB24 5CV',
  councilTaxBand: 'B',
  propertyKind: 'residential',
  heatingType: 'gas',
  hasGarden: true,
  hasGarage: false,
  hasOffStreetParking: false,
  isNewBuild: false,
  text: '2 bedroom, 1 bathroom property with 1 public room at Flat E, 12 Merrow Street Aberdeen.',
};

describe('SearchController', () => {
  it('answers with the query, the filters as applied, the results and the timings, and nothing else', async () => {
    const search = vi.fn().mockResolvedValue({
      results: [RESULT],
      timing: { embedMs: 30, searchMs: 76, totalMs: 106, extra: 'not for the caller' },
    });
    const controller = new SearchController({ search } as unknown as SemanticSearchService);

    const response = await controller.semanticSearch(REQUEST);

    expect(search).toHaveBeenCalledWith(REQUEST);
    expect(response).toEqual({
      query: REQUEST.query,
      topK: 8,
      filters: REQUEST.filters,
      results: [RESULT],
      timing: { embedMs: 30, searchMs: 76, totalMs: 106 },
    });
    expect(semanticSearchResponseSchema.parse(response)).toEqual(response);
  });
});
