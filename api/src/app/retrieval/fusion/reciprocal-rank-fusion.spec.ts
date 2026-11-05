import { fuseRankings, RRF_RANK_CONSTANT } from './reciprocal-rank-fusion.js';

const K = RRF_RANK_CONSTANT;

function at(rank: number): number {
  return 1 / (K + rank);
}

describe('fuseRankings', () => {
  it('scores an id by the sum of 1 / (k + rank) over the lists that hold it', () => {
    expect(fuseRankings([['1207', '1342'], ['1342']], 8)).toEqual([
      { id: '1342', score: at(2) + at(1), ranks: [2, 1] },
      { id: '1207', score: at(1), ranks: [1, null] },
    ]);
  });

  it('ranks an id found by two lists above one found at the top of only one', () => {
    const fused = fuseRankings(
      [
        ['1207', '1388', '1342'],
        ['50', '1388', '3501'],
      ],
      8,
    );

    expect(fused[0]?.id).toBe('1388');
  });

  it('keeps each id once, however many lists hold it', () => {
    const ids = fuseRankings(
      [
        ['1', '2', '3'],
        ['3', '2', '1'],
        ['2', '1', '3'],
      ],
      8,
    ).map((fused) => fused.id);

    expect(ids.sort()).toEqual(['1', '2', '3']);
  });

  it('counts an id repeated within one list at its first rank only', () => {
    expect(fuseRankings([['1207', '1342', '1207']], 8)).toEqual([
      { id: '1207', score: at(1), ranks: [1] },
      { id: '1342', score: at(2), ranks: [2] },
    ]);
  });

  it('breaks a tie of the same ranks on the rank in the earlier list', () => {
    expect(
      fuseRankings(
        [
          ['1342', '1207'],
          ['1207', '1342'],
        ],
        8,
      ),
    ).toEqual([
      { id: '1342', score: at(1) + at(2), ranks: [1, 2] },
      { id: '1207', score: at(2) + at(1), ranks: [2, 1] },
    ]);
  });

  it('breaks a tie of equal ranks on the earlier list', () => {
    expect(fuseRankings([['1207'], ['1342'], ['1388']], 8).map((fused) => fused.id)).toEqual([
      '1207',
      '1342',
      '1388',
    ]);
  });

  it('fuses the lists it has when one of them is empty', () => {
    expect(fuseRankings([[], ['1207', '1342']], 8)).toEqual([
      { id: '1207', score: at(1), ranks: [null, 1] },
      { id: '1342', score: at(2), ranks: [null, 2] },
    ]);
  });

  it('returns nothing when every list is empty, or there are no lists', () => {
    expect(fuseRankings([[], []], 8)).toEqual([]);
    expect(fuseRankings([], 8)).toEqual([]);
  });

  it('keeps only the top k of more candidates', () => {
    const many = Array.from({ length: 12 }, (_, index) => String(index + 1));

    const fused = fuseRankings([many, [...many].reverse()], 8);

    expect(fused).toHaveLength(8);
    expect(new Set(fused.map((entry) => entry.id)).size).toBe(8);
  });
});
