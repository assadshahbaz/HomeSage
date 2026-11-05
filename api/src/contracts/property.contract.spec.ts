import { propertySummarySchema } from './property.contract.js';

const PROPERTY_ID = '3501';

const SUMMARY = {
  id: PROPERTY_ID,
  address: '20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK',
  price: 229_000,
  bedrooms: 3,
  bathrooms: 2,
  publicRooms: 1,
  areaM2: 97,
  town: 'Aberdeen',
  postcodeDistrict: 'AB21',
  councilTaxBand: 'E',
  heatingType: 'gas',
  hasGarden: true,
  hasGarage: true,
  hasDoubleGarage: false,
  hasOffStreetParking: true,
  hasLand: false,
  hasGroundFloorBedroomBathroom: false,
  hasGrannyFlat: false,
  hasGreenEnergy: false,
  hasElectricVehicleChargePoint: false,
  isNewBuild: false,
};

describe('propertySummarySchema', () => {
  it('accepts a full summary unchanged', () => {
    expect(propertySummarySchema.parse(SUMMARY)).toEqual(SUMMARY);
  });

  it('accepts null for every fact the listing may not give', () => {
    const sparse = {
      ...SUMMARY,
      bedrooms: null,
      bathrooms: null,
      publicRooms: null,
      areaM2: null,
      town: null,
      postcodeDistrict: null,
      councilTaxBand: null,
      heatingType: null,
    };

    expect(propertySummarySchema.parse(sparse)).toEqual(sparse);
  });

  it.each([
    ['a missing address', { address: undefined }],
    ['an empty address', { address: '' }],
    ['an id that is not digits', { id: 'P-3501' }],
    ['a fractional price', { price: 229_000.5 }],
    ['a council tax band outside A to H', { councilTaxBand: 'Z' }],
    ['an unknown heating type', { heatingType: 'coal' }],
  ])('rejects %s', (_label, change) => {
    expect(propertySummarySchema.safeParse({ ...SUMMARY, ...change }).success).toBe(false);
  });

  it('rejects unknown keys, so property_kind cannot slip onto a card', () => {
    expect(
      propertySummarySchema.safeParse({ ...SUMMARY, propertyKind: 'residential' }).success,
    ).toBe(false);
  });
});
