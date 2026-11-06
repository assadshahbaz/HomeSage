import { formatPrice } from './price';

describe('formatPrice', () => {
  it.each([
    [229_000, '£229,000'],
    [500, '£500'],
    [1_499_000, '£1,499,000'],
    [99_999, '£99,999'],
  ])('writes %i as %s', (pounds, text) => {
    expect(formatPrice(pounds)).toBe(text);
  });
});
