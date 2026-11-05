/**
 * Damps the lead of a top rank, so a property near the top of two lists beats
 * one at the very top of only one. 60 is the value from the original RRF paper
 * and Elasticsearch's own default.
 */
export const RRF_RANK_CONSTANT = 60;

/** One property after fusion: its fused score and where each list ranked it. */
export interface FusedId {
  readonly id: string;
  readonly score: number;
  /** The rank in each input list, counted from 1, in input order; null where the list lacked it. */
  readonly ranks: readonly (number | null)[];
}

/**
 * Reciprocal Rank Fusion over any number of ranked id lists, best first. Each
 * id scores the sum of `1 / (RRF_RANK_CONSTANT + rank)` over the lists that
 * hold it, so ranks are combined and scores never are: a BM25 score and a
 * cosine similarity are not on one scale. An id repeated within one list
 * counts at its first rank only. Equal scores mean equal ranks, so a tie goes
 * to the id an earlier list holds, then to its rank there, and the order never
 * depends on chance.
 */
export function fuseRankings(lists: readonly (readonly string[])[], topK: number): FusedId[] {
  const ranksById = new Map<string, (number | null)[]>();
  lists.forEach((list, listIndex) => {
    list.forEach((id, position) => {
      const ranks = ranksById.get(id) ?? lists.map((): number | null => null);
      ranks[listIndex] ??= position + 1;
      ranksById.set(id, ranks);
    });
  });

  const fused = [...ranksById].map(([id, ranks]) => ({
    id,
    ranks,
    score: ranks.reduce<number>(
      (sum, rank) => (rank === null ? sum : sum + 1 / (RRF_RANK_CONSTANT + rank)),
      0,
    ),
    firstList: ranks.findIndex((rank) => rank !== null),
  }));
  fused.sort(
    (a, b) =>
      b.score - a.score ||
      a.firstList - b.firstList ||
      (a.ranks[a.firstList] ?? 0) - (b.ranks[b.firstList] ?? 0),
  );
  return fused.slice(0, topK).map(({ id, score, ranks }) => ({ id, score, ranks }));
}
