/** The retrieval paths a pool is drawn from, as the labelling method names them. */
export const POOL_PATH = {
  SQL: 'sql',
  BM25: 'bm25',
  KNN: 'knn',
} as const;

export type PoolPath = (typeof POOL_PATH)[keyof typeof POOL_PATH];

/** What one path returned for a question, best first. */
export interface PathResult {
  readonly path: PoolPath;
  readonly ids: readonly number[];
}

/** A property in the pool, and every path that found it. */
export interface PoolCandidate {
  readonly id: number;
  readonly foundBy: readonly PoolPath[];
}

/**
 * Merges what each path found into one pool, each property once. Candidates
 * keep the order they were first seen in, path by path, and remember every path
 * that found them, since a candidate only one path found says something about
 * the other two.
 */
export function mergePool(results: readonly PathResult[]): PoolCandidate[] {
  const pool = new Map<number, PoolPath[]>();
  for (const { path, ids } of results) {
    for (const id of ids) {
      const foundBy = pool.get(id) ?? [];
      if (!foundBy.includes(path)) {
        foundBy.push(path);
      }
      pool.set(id, foundBy);
    }
  }
  return [...pool].map(([id, foundBy]) => ({ id, foundBy }));
}
