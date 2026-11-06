import { formatCount } from './count';

const BEDROOM = { one: 'bedroom', many: 'bedrooms' };

describe('formatCount', () => {
  it.each([
    [1, '1 bedroom'],
    [3, '3 bedrooms'],
    [0, '0 bedrooms'],
  ])('writes %i as %s', (count, text) => {
    expect(formatCount(count, BEDROOM)).toBe(text);
  });

  it('writes nothing for a count the listing did not give', () => {
    expect(formatCount(null, BEDROOM)).toBeNull();
  });
});
