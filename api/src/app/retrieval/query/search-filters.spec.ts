import { searchFiltersSchema } from '../../../contracts/index.js';
import type { SearchFilters } from '../../../contracts/index.js';
import { filterClauses } from './search-filters.js';

const RESIDENTIAL_ONLY = { terms: { property_kind: ['residential'] } };

function clausesOf(filters: Partial<SearchFilters>): unknown[] {
  return filterClauses({ propertyKinds: ['residential'], ...filters });
}

describe('filterClauses', () => {
  it('limits the search to the default residential kind when nothing else is asked', () => {
    expect(clausesOf({})).toEqual([RESIDENTIAL_ONLY]);
  });

  it.each([
    [
      'a price range',
      { minPrice: 100_000, maxPrice: 200_000 },
      { range: { price: { gte: 100_000, lte: 200_000 } } },
    ],
    [
      'a price floor only',
      { minPrice: 100_000 },
      { range: { price: { gte: 100_000, lte: undefined } } },
    ],
    [
      'a bedroom range',
      { minBedrooms: 2, maxBedrooms: 3 },
      { range: { bedrooms: { gte: 2, lte: 3 } } },
    ],
    [
      'districts',
      { postcodeDistricts: ['AB10', 'AB15'] },
      { terms: { postcode_district: ['AB10', 'AB15'] } },
    ],
    [
      'bands',
      { councilTaxBands: ['C' as const, 'D' as const] },
      { terms: { council_tax_band: ['C', 'D'] } },
    ],
    ['a garden', { hasGarden: true as const }, { term: { has_garden: true } }],
    ['a garage', { hasGarage: true as const }, { term: { has_garage: true } }],
    [
      'off street parking',
      { hasOffStreetParking: true as const },
      { term: { has_off_street_parking: true } },
    ],
    ['a new build', { isNewBuild: true as const }, { term: { is_new_build: true } }],
  ])('turns %s into a clause', (_, filters, clause) => {
    expect(clausesOf(filters)).toEqual([RESIDENTIAL_ONLY, clause]);
  });

  it('matches towns ignoring case, any of them', () => {
    expect(clausesOf({ towns: ['aberdeen', 'Ellon'] })).toEqual([
      RESIDENTIAL_ONLY,
      {
        bool: {
          should: [
            { term: { town: { value: 'aberdeen', case_insensitive: true } } },
            { term: { town: { value: 'Ellon', case_insensitive: true } } },
          ],
          minimum_should_match: 1,
        },
      },
    ]);
  });

  it('searches the kinds the request names instead of residential', () => {
    expect(clausesOf({ propertyKinds: ['plot', 'commercial'] })).toEqual([
      { terms: { property_kind: ['plot', 'commercial'] } },
    ]);
  });

  it('combines every filter it is given', () => {
    expect(
      clausesOf({ maxPrice: 200_000, towns: ['Aberdeen'], hasGarden: true, isNewBuild: true }),
    ).toHaveLength(5);
  });

  // A filter the index cannot apply would let a branch search unfiltered, so
  // every filter field must produce its own clause.
  it.each<[string, Partial<SearchFilters>]>([
    ['minPrice', { minPrice: 1 }],
    ['maxPrice', { maxPrice: 1 }],
    ['minBedrooms', { minBedrooms: 1 }],
    ['maxBedrooms', { maxBedrooms: 1 }],
    ['postcodeDistricts', { postcodeDistricts: ['AB10'] }],
    ['towns', { towns: ['Ellon'] }],
    ['councilTaxBands', { councilTaxBands: ['A'] }],
    ['hasGarden', { hasGarden: true }],
    ['hasGarage', { hasGarage: true }],
    ['hasOffStreetParking', { hasOffStreetParking: true }],
    ['isNewBuild', { isNewBuild: true }],
  ])('applies %s in the index', (_, filters) => {
    expect(clausesOf(filters).length).toBeGreaterThan(clausesOf({}).length);
  });

  it('covers every filter field the contract has', () => {
    const covered = [
      'propertyKinds',
      'minPrice',
      'maxPrice',
      'minBedrooms',
      'maxBedrooms',
      'postcodeDistricts',
      'towns',
      'councilTaxBands',
      'hasGarden',
      'hasGarage',
      'hasOffStreetParking',
      'isNewBuild',
    ];

    expect(Object.keys(searchFiltersSchema.shape).sort()).toEqual(covered.sort());
  });
});
