import { ZodError } from 'zod';
import { toSearchResult } from './search-hit.js';

const SOURCE = {
  id: '3501',
  text: '2 bedroom, 1 bathroom property with 1 public room at Flat E, 12 Merrow Street Aberdeen.',
  price: 80_000,
  bedrooms: 2,
  bathrooms: 1,
  public_rooms: 1,
  area_m2: null,
  post_code: 'AB24 5CV',
  postcode_district: 'AB24',
  town: 'Aberdeen',
  council_tax_band: 'B',
  property_kind: 'residential',
  heating_type: 'gas',
  has_garden: true,
  has_garage: false,
  has_off_street_parking: false,
  is_new_build: false,
};

describe('toSearchResult', () => {
  it('turns a hit into a result card with its score', () => {
    expect(toSearchResult({ _id: '3501', _score: 0.827, _source: SOURCE })).toEqual({
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
      text: SOURCE.text,
    });
  });

  it.each([
    ['a hit without a score', { _source: SOURCE }],
    ['a hit without its source', { _score: 0.8 }],
    ['a price that is not a number', { _score: 0.8, _source: { ...SOURCE, price: '80000' } }],
    ['an unknown property kind', { _score: 0.8, _source: { ...SOURCE, property_kind: 'castle' } }],
  ])('refuses %s', (_, hit) => {
    expect(() => toSearchResult(hit)).toThrow(ZodError);
  });
});
