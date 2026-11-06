import { searchFiltersSchema } from '../../../contracts/index.js';
import type { PropertySummary } from '../../../contracts/index.js';
import { filterViolations } from './filter-violations.js';
import type { FilterName } from './filter-violations.js';

const CARD: PropertySummary = {
  id: '1294',
  address: '10 Lindenhurst Avenue, Inverurie, AB51 4CK',
  price: 218_000,
  bedrooms: 3,
  bathrooms: 1,
  publicRooms: 1,
  areaM2: 90,
  town: 'Inverurie',
  postcodeDistrict: 'AB51',
  councilTaxBand: 'D',
  heatingType: 'gas',
  hasGarden: true,
  hasGarage: true,
  hasDoubleGarage: false,
  hasOffStreetParking: false,
  hasLand: false,
  hasGroundFloorBedroomBathroom: true,
  hasGrannyFlat: false,
  hasGreenEnergy: false,
  hasElectricVehicleChargePoint: false,
  isNewBuild: false,
};

function violations(
  filters: Record<string, unknown>,
  card: Partial<PropertySummary> = {},
  kind: 'residential' | 'plot' = 'residential',
): FilterName[] {
  return filterViolations({ ...CARD, ...card }, kind, searchFiltersSchema.parse(filters));
}

describe('filterViolations', () => {
  it('passes a property that meets every filter', () => {
    expect(
      violations({
        minPrice: 200_000,
        maxPrice: 250_000,
        minBedrooms: 3,
        maxBedrooms: 3,
        towns: ['inverurie'],
        postcodeDistricts: ['ab51'],
        councilTaxBands: ['C', 'D'],
        hasGarden: true,
        hasGarage: true,
      }),
    ).toEqual([]);
  });

  it('passes a property with no filters but the default kind', () => {
    expect(violations({})).toEqual([]);
  });

  it.each([
    ['a price above the maximum', { maxPrice: 200_000 }, {}, ['maxPrice']],
    ['a price below the minimum', { minPrice: 250_000 }, {}, ['minPrice']],
    ['a price exactly on both bounds', { minPrice: 218_000, maxPrice: 218_000 }, {}, []],
    ['too many bedrooms', { maxBedrooms: 2 }, {}, ['maxBedrooms']],
    ['too few bedrooms', { minBedrooms: 4 }, {}, ['minBedrooms']],
    [
      'no bedroom count against a bedroom filter',
      { minBedrooms: 1 },
      { bedrooms: null },
      ['minBedrooms'],
    ],
    ['another town', { towns: ['Ellon', 'Westhill'] }, {}, ['towns']],
    ['no town against a town filter', { towns: ['Inverurie'] }, { town: null }, ['towns']],
    ['another district', { postcodeDistricts: ['AB10'] }, {}, ['postcodeDistricts']],
    ['another council tax band', { councilTaxBands: ['A'] }, {}, ['councilTaxBands']],
    [
      'no band against a band filter',
      { councilTaxBands: ['D'] },
      { councilTaxBand: null },
      ['councilTaxBands'],
    ],
    ['a feature that is not stated', { hasOffStreetParking: true }, {}, ['hasOffStreetParking']],
    ['a new build filter on an older home', { isNewBuild: true }, {}, ['isNewBuild']],
    [
      'several filters at once',
      { maxPrice: 150_000, towns: ['Ellon'], hasOffStreetParking: true },
      {},
      ['maxPrice', 'towns', 'hasOffStreetParking'],
    ],
  ])('names %s', (_, filters, card, expected) => {
    expect(violations(filters, card)).toEqual(expected);
  });

  it('fails a plot against the default residential kind', () => {
    expect(violations({}, {}, 'plot')).toEqual(['propertyKinds']);
  });

  it('passes a plot when the question asked for every kind', () => {
    expect(
      violations({ propertyKinds: ['residential', 'plot', 'commercial', 'other'] }, {}, 'plot'),
    ).toEqual([]);
  });
});
