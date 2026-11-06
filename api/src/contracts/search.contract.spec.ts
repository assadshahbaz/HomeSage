import {
  SEARCH_TOP_K_DEFAULT,
  SEARCH_TOP_K_MAX,
  semanticSearchRequestSchema,
  semanticSearchResponseSchema,
} from './search.contract.js';

const QUERY = 'cosy flat with a garden and a quiet street';

function issues(body: unknown): string[] {
  const parsed = semanticSearchRequestSchema.safeParse(body);
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

describe('semanticSearchRequestSchema', () => {
  it('trims the query and fills the defaults, residential only included, when nothing else is sent', () => {
    expect(semanticSearchRequestSchema.parse({ query: `  ${QUERY} ` })).toEqual({
      query: QUERY,
      topK: SEARCH_TOP_K_DEFAULT,
      filters: { propertyKinds: ['residential'] },
    });
  });

  it('keeps every filter it is given, with districts in capitals', () => {
    const filters = {
      minPrice: 100_000,
      maxPrice: 250_000,
      minBedrooms: 2,
      maxBedrooms: 3,
      postcodeDistricts: ['ab10', ' AB15 '],
      towns: ['Aberdeen'],
      councilTaxBands: ['C', 'D'],
      propertyKinds: ['residential', 'plot'],
      hasGarden: true,
      hasGarage: true,
      hasOffStreetParking: true,
      isNewBuild: true,
    };

    expect(semanticSearchRequestSchema.parse({ query: QUERY, topK: 5, filters })).toEqual({
      query: QUERY,
      topK: 5,
      filters: { ...filters, postcodeDistricts: ['AB10', 'AB15'] },
    });
  });

  it('accepts a minimum equal to its maximum', () => {
    expect(issues({ query: QUERY, filters: { minBedrooms: 2, maxBedrooms: 2 } })).toEqual([]);
  });

  it.each([
    ['an empty query', { query: '   ' }, 'query:'],
    ['a query over 500 characters', { query: 'x'.repeat(501) }, 'query:'],
    ['a topK of 0', { query: QUERY, topK: 0 }, 'topK:'],
    [
      `a topK over ${String(SEARCH_TOP_K_MAX)}`,
      { query: QUERY, topK: SEARCH_TOP_K_MAX + 1 },
      'topK:',
    ],
    ['a fractional topK', { query: QUERY, topK: 2.5 }, 'topK:'],
    ['a negative price', { query: QUERY, filters: { minPrice: -1 } }, 'filters.minPrice:'],
    [
      'a minimum price above the maximum',
      { query: QUERY, filters: { minPrice: 300_000, maxPrice: 200_000 } },
      'filters.minPrice: minPrice is above maxPrice',
    ],
    [
      'minimum bedrooms above the maximum',
      { query: QUERY, filters: { minBedrooms: 4, maxBedrooms: 2 } },
      'filters.minBedrooms: minBedrooms is above maxBedrooms',
    ],
    [
      'a flag filtered on false',
      { query: QUERY, filters: { hasGarden: false } },
      'filters.hasGarden: Only true can be filtered on: a flag of 0 in this data means not stated, not no',
    ],
    [
      'an unknown band',
      { query: QUERY, filters: { councilTaxBands: ['I'] } },
      'filters.councilTaxBands.0:',
    ],
    [
      'an unknown kind',
      { query: QUERY, filters: { propertyKinds: ['castle'] } },
      'filters.propertyKinds.0:',
    ],
    ['an empty list of towns', { query: QUERY, filters: { towns: [] } }, 'filters.towns:'],
    ['an unknown filter', { query: QUERY, filters: { nearUniversity: true } }, 'filters:'],
    ['an unknown field', { query: QUERY, limit: 5 }, ':'],
  ])('refuses %s', (_, body, expected) => {
    expect(issues(body).some((issue) => issue.startsWith(expected))).toBe(true);
  });
});

describe('semanticSearchResponseSchema', () => {
  const result = {
    id: '2494',
    score: 0.83,
    price: 179_000,
    bedrooms: 2,
    bathrooms: 1,
    publicRooms: 1,
    areaM2: 75,
    town: 'Inverurie',
    postcodeDistrict: 'AB51',
    postCode: 'AB51 4CV',
    councilTaxBand: 'C',
    propertyKind: 'residential',
    heatingType: 'gas',
    hasGarden: true,
    hasGarage: false,
    hasOffStreetParking: false,
    isNewBuild: false,
    text: '2 bedroom, 1 bathroom property at 4 Glenfarrow Gardens Inverurie.',
  };
  const body = {
    query: QUERY,
    topK: 8,
    filters: { propertyKinds: ['residential'] },
    results: [result],
    timing: { embedMs: 70, searchMs: 8, totalMs: 80 },
  };

  it('accepts a response with results and timings', () => {
    expect(semanticSearchResponseSchema.parse(body)).toEqual(body);
  });

  it('refuses a result without its card fields', () => {
    const withoutPrice: Record<string, unknown> = { ...result };
    delete withoutPrice['price'];

    expect(
      semanticSearchResponseSchema.safeParse({ ...body, results: [withoutPrice] }).success,
    ).toBe(false);
  });
});
