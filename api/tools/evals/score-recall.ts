/** How many of the relevant properties a ranking found in its top k, out of how many it could have. */
export interface RecallScore {
  readonly found: number;
  /** The smaller of k and the number of relevant ids, so a perfect top k scores 1. */
  readonly possible: number;
  readonly recall: number;
}

/**
 * Recall at k over a ranking of property ids. Uncertain ids are taken out of
 * the ranking before the cut, so returning one neither earns a hit nor uses up
 * a slot a relevant property could have had. Plain recall divides by every
 * relevant id, which caps a question with 40 of them at 8 in 40 for a top 8;
 * dividing by k when it is smaller measures how well the k slots were used.
 */
export function scoreRecall(
  ranking: readonly number[],
  relevant: readonly number[],
  uncertain: readonly number[],
  k: number,
): RecallScore {
  const relevantIds = new Set(relevant);
  const uncertainIds = new Set(uncertain);
  const judged = ranking.filter((id) => !uncertainIds.has(id)).slice(0, k);
  const found = new Set(judged.filter((id) => relevantIds.has(id))).size;
  const possible = Math.min(k, relevantIds.size);
  return { found, possible, recall: possible === 0 ? 0 : found / possible };
}

/**
 * Recall at k when two rankings each keep their own top k: the relevant ids
 * found in either, out of the same `possible` as one ranking. It is the most a
 * fusion of the two could find, since a fused top k holds no id that neither
 * ranking had in its own top k.
 */
export function scoreRecallOfEither(
  first: readonly number[],
  second: readonly number[],
  relevant: readonly number[],
  uncertain: readonly number[],
  k: number,
): RecallScore {
  const relevantIds = new Set(relevant);
  const uncertainIds = new Set(uncertain);
  const topK = (ranking: readonly number[]): number[] =>
    ranking.filter((id) => !uncertainIds.has(id)).slice(0, k);
  const either = new Set([...topK(first), ...topK(second)].filter((id) => relevantIds.has(id)));
  const possible = Math.min(k, relevantIds.size);
  const found = Math.min(either.size, possible);
  return { found, possible, recall: possible === 0 ? 0 : found / possible };
}
