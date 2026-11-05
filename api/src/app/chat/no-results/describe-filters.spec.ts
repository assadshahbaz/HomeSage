import { searchFiltersSchema } from '../../../contracts/index.js';
import { describeFilters } from './describe-filters.js';

function described(filters: Record<string, unknown>): string[] {
  return describeFilters(searchFiltersSchema.parse(filters));
}

describe('describeFilters', () => {
  it('says nothing for the defaults alone', () => {
    expect(described({})).toEqual([]);
  });

  it.each([
    ['a price cap', { maxPrice: 50_000 }, 'up to £50,000'],
    ['a price floor', { minPrice: 300_000 }, '£300,000 or more'],
    ['a price range', { minPrice: 100_000, maxPrice: 150_000 }, 'between £100,000 and £150,000'],
    ['an exact bedroom count', { minBedrooms: 3, maxBedrooms: 3 }, '3 bedrooms'],
    ['one bedroom', { minBedrooms: 1, maxBedrooms: 1 }, '1 bedroom'],
    ['a bedroom range', { minBedrooms: 2, maxBedrooms: 4 }, '2 to 4 bedrooms'],
    ['a bedroom floor', { minBedrooms: 5 }, 'at least 5 bedrooms'],
    ['a bedroom cap', { maxBedrooms: 1 }, 'at most 1 bedroom'],
    ['one town', { towns: ['Westhill'] }, 'in Westhill'],
    ['two towns', { towns: ['Ellon', 'Westhill'] }, 'in Ellon or Westhill'],
    ['three towns', { towns: ['Ellon', 'Huntly', 'Westhill'] }, 'in Ellon, Huntly or Westhill'],
    ['districts', { postcodeDistricts: ['ab10', 'AB11'] }, 'in AB10 or AB11'],
    ['council tax bands', { councilTaxBands: ['C', 'D'] }, 'in council tax band C or D'],
    ['another kind', { propertyKinds: ['commercial'] }, 'commercial units'],
    ['several kinds', { propertyKinds: ['plot', 'other'] }, 'plots or other listings'],
    ['a garden', { hasGarden: true }, 'with a garden'],
    ['a garage', { hasGarage: true }, 'with a garage'],
    ['parking', { hasOffStreetParking: true }, 'with off street parking'],
    ['a new build', { isNewBuild: true }, 'new build'],
  ])('describes %s', (_, filters, phrase) => {
    expect(described(filters)).toEqual([phrase]);
  });

  it('describes several filters, kind and place first', () => {
    expect(
      described({
        propertyKinds: ['residential', 'plot'],
        towns: ['Ellon'],
        maxPrice: 200_000,
        minBedrooms: 3,
        hasGarden: true,
      }),
    ).toEqual([
      'homes or plots',
      'in Ellon',
      'up to £200,000',
      'at least 3 bedrooms',
      'with a garden',
    ]);
  });
});
