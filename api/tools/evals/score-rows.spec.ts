import { scoreRows } from './score-rows.ts';
import type { Row } from './score-rows.ts';

describe('scoreRows', () => {
  it('passes the same ids in any order when order was not asked for', () => {
    expect(scoreRows([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }], false)).toEqual({
      passed: true,
      reason: '2 rows match',
    });
  });

  it('ignores column names and extra columns', () => {
    const expected = [{ town: 'Ellon', listings: 64 }];
    const actual = [{ town: 'Ellon', 'COUNT(*)': 64, average_price: '205000.5000' }];

    expect(scoreRows(expected, actual, false).passed).toBe(true);
  });

  it('accepts an average the model rounded to whole pounds', () => {
    expect(scoreRows([{ average: '275726.4851' }], [{ avg: 275726 }], false).passed).toBe(true);
  });

  it('refuses a count that is off by one', () => {
    expect(scoreRows([{ n: 53 }], [{ n: 154 }], false)).toEqual({
      passed: false,
      reason: 'a row {"n":53} is missing',
    });
  });

  it('refuses a row count that differs', () => {
    expect(scoreRows([{ id: 1 }], [{ id: 1 }, { id: 2 }], false)).toEqual({
      passed: false,
      reason: 'expected 1 rows, got 2',
    });
  });

  it('compares position by position when the question asked for an order', () => {
    const cheapestFirst = [{ price: 110000 }, { price: 130000 }];

    expect(scoreRows(cheapestFirst, [{ price: 110000 }, { price: 130000 }], true).passed).toBe(
      true,
    );
    expect(scoreRows(cheapestFirst, [{ price: 130000 }, { price: 110000 }], true)).toEqual({
      passed: false,
      reason: 'row 1 {"price":110000} is missing',
    });
  });

  it('matches a NULL answer from a LEFT JOIN, and a boolean against 1', () => {
    const expected: Row[] = [
      { id: 975, mains_drainage: null },
      { id: 216, garden: 1 },
    ];
    const actual: Row[] = [
      { id: 216, garden: true },
      { id: 975, mains_drainage: null },
    ];

    expect(scoreRows(expected, actual, false).passed).toBe(true);
  });

  it('does not let one model row answer for two reference rows', () => {
    expect(
      scoreRows(
        [{ price: 140000 }, { price: 140000 }],
        [{ price: 140000 }, { price: 150000 }],
        false,
      ).passed,
    ).toBe(false);
  });

  it('does not let one cell answer for two values in a row', () => {
    expect(scoreRows([{ a: 3, b: 3 }], [{ x: 3 }], false).passed).toBe(false);
  });

  it('passes two empty results', () => {
    expect(scoreRows([], [], false).passed).toBe(true);
  });
});
