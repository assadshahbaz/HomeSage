import type { FilterValues } from '../vocabulary/filter-vocabulary.js';
import { checkRouteFilters } from './route-filters.js';

const VALUES: FilterValues = {
  towns: ['Aberdeen', 'Ellon', 'Inverurie', 'Stonehaven'],
  postcodeDistricts: ['AB10', 'AB15', 'AB41', 'AB51'],
};
const RESIDENTIAL = ['residential'];

describe('checkRouteFilters', () => {
  it('keeps every valid filter and applies the defaults', () => {
    const raw = {
      minPrice: 100_000,
      maxPrice: 250_000,
      minBedrooms: 2,
      maxBedrooms: 3,
      towns: ['Ellon'],
      postcodeDistricts: ['AB41'],
      councilTaxBands: ['C', 'D'],
      hasGarden: true,
      hasGarage: true,
      hasOffStreetParking: true,
      isNewBuild: true,
    };

    expect(checkRouteFilters(raw, VALUES)).toEqual({
      filters: { ...raw, propertyKinds: RESIDENTIAL },
      dropped: [],
    });
  });

  it('gives no filters but the default for an empty object', () => {
    expect(checkRouteFilters({}, VALUES)).toEqual({
      filters: { propertyKinds: RESIDENTIAL },
      dropped: [],
    });
  });

  it('treats a null filter as absent, without reporting it', () => {
    expect(checkRouteFilters({ maxPrice: null, towns: null }, VALUES)).toEqual({
      filters: { propertyKinds: RESIDENTIAL },
      dropped: [],
    });
  });

  it.each([
    ['a town in another case', { towns: ['ELLON'] }, { towns: ['Ellon'] }],
    ['a town with spaces round it', { towns: [' stonehaven '] }, { towns: ['Stonehaven'] }],
    ['a district in lower case', { postcodeDistricts: ['ab15'] }, { postcodeDistricts: ['AB15'] }],
    ['a band in lower case', { councilTaxBands: ['e'] }, { councilTaxBands: ['E'] }],
    ['a kind in capitals', { propertyKinds: ['PLOT'] }, { propertyKinds: ['plot'] }],
    ['a single town not in a list', { towns: 'Inverurie' }, { towns: ['Inverurie'] }],
    ['a town named twice', { towns: ['Ellon', 'ellon'] }, { towns: ['Ellon'] }],
  ])('reads %s in the stored spelling', (_, raw, expected) => {
    const { filters, dropped } = checkRouteFilters(raw, VALUES);

    expect(filters).toMatchObject(expected);
    expect(dropped).toEqual([]);
  });

  it('drops a town the data does not hold and keeps the known ones', () => {
    expect(checkRouteFilters({ towns: ['Ellon', 'Glasgow'] }, VALUES)).toEqual({
      filters: { towns: ['Ellon'], propertyKinds: RESIDENTIAL },
      dropped: [{ filter: 'towns', value: 'Glasgow', reason: 'unknown_value' }],
    });
  });

  it('drops the whole filter when none of its values are known', () => {
    expect(checkRouteFilters({ postcodeDistricts: ['EH1', 'G1'] }, VALUES)).toEqual({
      filters: { propertyKinds: RESIDENTIAL },
      dropped: [
        { filter: 'postcodeDistricts', value: 'EH1', reason: 'unknown_value' },
        { filter: 'postcodeDistricts', value: 'G1', reason: 'unknown_value' },
      ],
    });
  });

  it.each([
    ['a band past H', { councilTaxBands: ['Z'] }, 'councilTaxBands', 'Z'],
    ['an unknown property kind', { propertyKinds: ['castle'] }, 'propertyKinds', 'castle'],
    ['a town that is not text', { towns: [42] }, 'towns', 42],
  ])('drops %s as an unknown value', (_, raw, filter, value) => {
    expect(checkRouteFilters(raw, VALUES).dropped).toEqual([
      { filter, value, reason: 'unknown_value' },
    ]);
  });

  it('falls back to residential when every property kind is unknown', () => {
    expect(checkRouteFilters({ propertyKinds: ['castle'] }, VALUES).filters.propertyKinds).toEqual(
      RESIDENTIAL,
    );
  });

  it('drops a filter the search does not have', () => {
    expect(checkRouteFilters({ bathrooms: 2, maxPrice: 300_000 }, VALUES)).toEqual({
      filters: { maxPrice: 300_000, propertyKinds: RESIDENTIAL },
      dropped: [{ filter: 'bathrooms', value: 2, reason: 'unknown_filter' }],
    });
  });

  it.each([
    ['a flag set to false', 'hasGarden', false],
    ['a price as text', 'maxPrice', '250k'],
    ['a negative price', 'minPrice', -1],
    ['a fractional bedroom count', 'minBedrooms', 2.5],
  ])('drops %s as an invalid value', (_, filter, value) => {
    expect(checkRouteFilters({ [filter]: value }, VALUES)).toEqual({
      filters: { propertyKinds: RESIDENTIAL },
      dropped: [{ filter, value, reason: 'invalid_value' }],
    });
  });

  it.each([
    ['price', 'minPrice', 'maxPrice', 300_000, 200_000],
    ['bedroom', 'minBedrooms', 'maxBedrooms', 4, 2],
  ])('drops both ends of an inverted %s range', (_, min, max, low, high) => {
    expect(checkRouteFilters({ [min]: low, [max]: high, towns: ['Ellon'] }, VALUES)).toEqual({
      filters: { towns: ['Ellon'], propertyKinds: RESIDENTIAL },
      dropped: [
        { filter: min, value: low, reason: 'inverted_range' },
        { filter: max, value: high, reason: 'inverted_range' },
      ],
    });
  });

  it('keeps an equal minimum and maximum', () => {
    expect(checkRouteFilters({ minBedrooms: 3, maxBedrooms: 3 }, VALUES).filters).toMatchObject({
      minBedrooms: 3,
      maxBedrooms: 3,
    });
  });
});
