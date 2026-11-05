import { citedProperties } from './cited-properties';
import { aPropertySummary } from './property-summary.fixture';

const FIRST = aPropertySummary({ id: '3501' });
const SECOND = aPropertySummary({ id: '50' });
const UNCITED = aPropertySummary({ id: '1244' });
const RETRIEVED = [FIRST, SECOND, UNCITED];

const ids = (citedIds: string[]): string[] =>
  citedProperties(citedIds, RETRIEVED).map((property) => property.id);

describe('citedProperties', () => {
  it('keeps the order of citation, not of retrieval', () => {
    expect(ids(['50', '3501'])).toEqual(['50', '3501']);
  });

  it('never includes a property that was retrieved but not cited', () => {
    expect(ids(['3501'])).toEqual(['3501']);
  });

  it('skips a cited id with no retrieved property', () => {
    expect(ids(['9999', '50'])).toEqual(['50']);
  });

  it('gives one card for an id cited twice', () => {
    expect(ids(['50', '3501', '50'])).toEqual(['50', '3501']);
  });

  it('gives nothing when nothing is cited', () => {
    expect(ids([])).toEqual([]);
  });
});
