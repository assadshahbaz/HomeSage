import { mergePool, POOL_PATH } from './candidate-pool.ts';

describe('mergePool', () => {
  it('keeps each property once, with every path that found it, in first seen order', () => {
    expect(
      mergePool([
        { path: POOL_PATH.SQL, ids: [1201, 1202, 1203] },
        { path: POOL_PATH.BM25, ids: [1203, 1204] },
        { path: POOL_PATH.KNN, ids: [1204, 1201, 1205] },
      ]),
    ).toEqual([
      { id: 1201, foundBy: ['sql', 'knn'] },
      { id: 1202, foundBy: ['sql'] },
      { id: 1203, foundBy: ['sql', 'bm25'] },
      { id: 1204, foundBy: ['bm25', 'knn'] },
      { id: 1205, foundBy: ['knn'] },
    ]);
  });

  it('counts a path once even when it lists a property twice', () => {
    expect(mergePool([{ path: POOL_PATH.KNN, ids: [1201, 1201] }])).toEqual([
      { id: 1201, foundBy: ['knn'] },
    ]);
  });

  it('gives an empty pool when no path found anything', () => {
    expect(
      mergePool([
        { path: POOL_PATH.SQL, ids: [] },
        { path: POOL_PATH.BM25, ids: [] },
      ]),
    ).toEqual([]);
  });
});
