import {
  councilTaxBand,
  postcode,
  postcodeDistrict,
  propertyKind,
  townFromAddress,
} from './address.ts';

describe('councilTaxBand', () => {
  it('keeps real bands and drops the placeholders', () => {
    expect(councilTaxBand('D')).toBe('D');
    expect(councilTaxBand('h')).toBe('H');
    for (const value of ['NA', 'none', 'TBC', '', null]) {
      expect(councilTaxBand(value)).toBeNull();
    }
  });
});

describe('postcode', () => {
  it('accepts real postcodes and derives the district', () => {
    expect(postcode('ab21 9ck')).toBe('AB21 9CK');
    expect(postcodeDistrict('AB21 9CK')).toBe('AB21');
    expect(postcodeDistrict('AB219CK')).toBe('AB21');
  });

  it('rejects anything that is not a postcode', () => {
    expect(postcode('')).toBeNull();
    expect(postcode('Aberdeen')).toBeNull();
    expect(postcodeDistrict('')).toBeNull();
  });
});

describe('townFromAddress', () => {
  it('finds the town even when it is part of the street line', () => {
    expect(townFromAddress('20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK')).toBe('Aberdeen');
    expect(townFromAddress('Brackenhurst Road Inverurie, AB51 3KV')).toBe('Inverurie');
    expect(townFromAddress('Deanslea Millbrae, Keith, AB55 6CK')).toBe('Keith');
  });

  it('returns null when no known town is named', () => {
    expect(townFromAddress('Lodge 11, Cameron House Timeshare Loch Lomond, G83 8CK')).toBeNull();
  });
});

describe('propertyKind', () => {
  it('separates homes from plots, commercial units and the rest', () => {
    expect(propertyKind('20 Larkfield Rise, Aberdeen', 3)).toBe('residential');
    expect(propertyKind('Plot At Bridge Of Rosarie Mulben, Keith', null)).toBe('plot');
    expect(propertyKind('Site Of Former Filling Station Rhynie, Huntly', null)).toBe('plot');
    expect(propertyKind('Commercial Premises, 43 Sable Street Banff', null)).toBe('commercial');
    expect(propertyKind('Lodge 11, Cameron House Loch Lomond', null)).toBe('other');
  });

  it('calls it a plot even when bedrooms are listed', () => {
    expect(propertyKind('Plot 4 Hillside, Ellon', 4)).toBe('plot');
  });
});
