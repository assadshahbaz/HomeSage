import { sqlErrorSchema, sqlRequestSchema, sqlResponseSchema } from './sql.contract.js';

describe('sqlRequestSchema', () => {
  it('trims the question', () => {
    expect(sqlRequestSchema.parse({ question: '  flats in Ellon ' })).toEqual({
      question: 'flats in Ellon',
    });
  });

  it.each([
    ['an empty question', ''],
    ['a question of only spaces', '   '],
    ['a question over 500 characters', 'x'.repeat(501)],
  ])('refuses %s', (_, question) => {
    expect(sqlRequestSchema.safeParse({ question }).success).toBe(false);
  });

  it('refuses a question that is not a string', () => {
    expect(sqlRequestSchema.safeParse({ question: 42 }).success).toBe(false);
  });
});

describe('sqlResponseSchema', () => {
  const answered = { question: 'q', sql: 'SELECT 1', corrected: false };

  it('accepts listing rows of strings, numbers, booleans and nulls, with the ordered flag', () => {
    const body = {
      kind: 'rows',
      ...answered,
      rows: [
        { id: 2494, full_address: '31 Provost Ellisdon Avenue', has_garden: true, area: null },
      ],
      rowCount: 1,
      ordered: true,
    };

    expect(sqlResponseSchema.parse(body)).toEqual(body);
  });

  it('accepts computed values with the number of listings behind them', () => {
    const body = {
      kind: 'aggregate',
      ...answered,
      values: [{ town: 'Ellon', average: '187000.0000', listings: 64 }],
      listingCount: 64,
    };

    expect(sqlResponseSchema.parse(body)).toEqual(body);
  });

  it.each([
    ['rows without the ordered flag', { kind: 'rows', ...answered, rows: [], rowCount: 0 }],
    ['an aggregate without a listing count', { kind: 'aggregate', ...answered, values: [] }],
    ['a body with no kind', { ...answered, rows: [], rowCount: 0, ordered: false }],
    ['an unknown kind', { kind: 'chart', ...answered }],
    [
      'a row holding an object',
      { kind: 'rows', ...answered, rows: [{ nested: {} }], rowCount: 1, ordered: false },
    ],
  ])('refuses %s', (_, body) => {
    expect(sqlResponseSchema.safeParse(body).success).toBe(false);
  });
});

describe('sqlErrorSchema', () => {
  it('accepts each error code the endpoint sends', () => {
    for (const errorCode of ['E_SQL_REJECTED', 'E_SQL_DECLINED', 'E_SQL_FAILED']) {
      expect(sqlErrorSchema.safeParse({ errorCode, message: 'm' }).success).toBe(true);
    }
  });

  it('refuses an unknown error code', () => {
    expect(sqlErrorSchema.safeParse({ errorCode: 'E_OTHER', message: 'm' }).success).toBe(false);
  });
});
