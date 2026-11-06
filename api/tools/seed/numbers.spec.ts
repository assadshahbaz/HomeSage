import { ImportDataError, optionalCount, requireInt } from './numbers.ts';

describe('requireInt', () => {
  it('reads numbers the source stored as text', () => {
    expect(requireInt('229000', 'price', 1)).toBe(229000);
    expect(requireInt(' 97 ', 'area_m2', 1)).toBe(97);
    expect(requireInt('160000.0', 'price', 1)).toBe(160000);
    // A few prices above a million are written this way in the source.
    expect(requireInt('1.2e+006', 'price', 1)).toBe(1200000);
  });

  it('refuses anything that is not a number, rather than importing a guess', () => {
    for (const value of ['', null, 'POA', '1,200', 'three', '97.5']) {
      expect(() => requireInt(value, 'price', 42)).toThrow(ImportDataError);
    }
  });
});

describe('optionalCount', () => {
  it('treats zero as not known', () => {
    expect(optionalCount('0', 'area_m2', 1)).toBeNull();
    expect(optionalCount('3', 'bedroom', 1)).toBe(3);
  });
});
