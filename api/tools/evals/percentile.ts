const PERCENT = 100;

/**
 * The nearest rank percentile of a sample: the smallest value with at least
 * `p` percent of the sample at or below it, so it is always a value that was
 * measured rather than one interpolated between two.
 */
export function percentile(sample: readonly number[], p: number): number {
  if (sample.length === 0) {
    throw new Error('a percentile needs at least one value');
  }
  const sorted = [...sample].sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil((p / PERCENT) * sorted.length));
  return sorted[rank - 1];
}
