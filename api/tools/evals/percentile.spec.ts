import { percentile } from './percentile.ts';

describe('percentile', () => {
  const twenty = Array.from({ length: 20 }, (_, index) => (index + 1) * 10);

  it.each([
    [50, 100],
    [95, 190],
    [100, 200],
    [1, 10],
  ])('p%i of 10 to 200 ms is %i', (p, expected) => {
    expect(percentile(twenty, p)).toBe(expected);
  });

  it('sorts a sample that arrives out of order', () => {
    expect(percentile([300, 100, 200], 50)).toBe(200);
  });

  it('is the one value of a sample of one', () => {
    expect(percentile([142], 95)).toBe(142);
  });

  it('refuses an empty sample', () => {
    expect(() => percentile([], 50)).toThrow('a percentile needs at least one value');
  });
});
