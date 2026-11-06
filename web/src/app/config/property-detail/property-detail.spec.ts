import { aPropertySummary } from '../../property/property-summary.fixture';
import { describeCouncilTax, describePlace, describeSize } from './property-detail';

describe('describeSize', () => {
  it('writes every count and the area it is given', () => {
    expect(describeSize(aPropertySummary())).toBe('3 bedrooms, 2 bathrooms, 1 public room, 97 m²');
  });

  it('skips what the listing did not give, with no gaps or zeros', () => {
    const summary = aPropertySummary({ bathrooms: null, publicRooms: null, areaM2: null });

    expect(describeSize(summary)).toBe('3 bedrooms');
  });

  it('is null when the listing gave no size at all', () => {
    const summary = aPropertySummary({
      bedrooms: null,
      bathrooms: null,
      publicRooms: null,
      areaM2: null,
    });

    expect(describeSize(summary)).toBeNull();
  });
});

describe('describePlace', () => {
  it.each([
    [{}, 'Aberdeen, AB21'],
    [{ town: null }, 'AB21'],
    [{ postcodeDistrict: null }, 'Aberdeen'],
    [{ town: null, postcodeDistrict: null }, null],
  ])('writes %o as %s', (change, text) => {
    expect(describePlace(aPropertySummary(change))).toBe(text);
  });
});

describe('describeCouncilTax', () => {
  it('names the band, or nothing when the listing gave none', () => {
    expect(describeCouncilTax(aPropertySummary())).toBe('Council tax band E');
    expect(describeCouncilTax(aPropertySummary({ councilTaxBand: null }))).toBeNull();
  });
});
