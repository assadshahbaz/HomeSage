import { toSqlAnswer } from './sql-answer.js';

const COUNT_COLUMN = 'homesage_listing_count';

describe('toSqlAnswer', () => {
  it('passes listing rows through with the ordered flag', () => {
    const rows = [
      { id: 2494, price: 125000 },
      { id: 428, price: 143500 },
    ];

    expect(toSqlAnswer({ kind: 'rows', ordered: true }, rows)).toEqual({
      kind: 'rows',
      rows,
      ordered: true,
    });
  });

  it('takes the count column out of a single aggregate value', () => {
    expect(
      toSqlAnswer({ kind: 'aggregate', countColumn: COUNT_COLUMN }, [
        { average_price: '221388.8889', [COUNT_COLUMN]: 45 },
      ]),
    ).toEqual({ kind: 'aggregate', values: [{ average_price: '221388.8889' }], listingCount: 45 });
  });

  it('sums the count over every group returned', () => {
    const answer = toSqlAnswer({ kind: 'aggregate', countColumn: COUNT_COLUMN }, [
      { town: 'Aberdeen', listings: 315, [COUNT_COLUMN]: 315 },
      { town: 'Inverurie', listings: 56, [COUNT_COLUMN]: 56 },
    ]);

    expect(answer).toEqual({
      kind: 'aggregate',
      values: [
        { town: 'Aberdeen', listings: 315 },
        { town: 'Inverurie', listings: 56 },
      ],
      listingCount: 371,
    });
  });

  it('reads a count MySQL sent as text', () => {
    expect(
      toSqlAnswer({ kind: 'aggregate', countColumn: COUNT_COLUMN }, [
        { n: 1, [COUNT_COLUMN]: '42' },
      ]),
    ).toMatchObject({ listingCount: 42 });
  });

  it('gives an aggregate over no rows a count of zero', () => {
    expect(toSqlAnswer({ kind: 'aggregate', countColumn: COUNT_COLUMN }, [])).toEqual({
      kind: 'aggregate',
      values: [],
      listingCount: 0,
    });
  });

  it.each([
    ['missing', {}],
    ['negative', { [COUNT_COLUMN]: -1 }],
    ['not a number', { [COUNT_COLUMN]: 'many' }],
  ])('refuses a count that is %s rather than reporting a wrong one', (_, row) => {
    expect(() => toSqlAnswer({ kind: 'aggregate', countColumn: COUNT_COLUMN }, [row])).toThrow(
      COUNT_COLUMN,
    );
  });
});
