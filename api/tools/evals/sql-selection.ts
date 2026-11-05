import { GOLDEN_SLICE } from './golden-set.ts';
import type { GoldenSelection } from './golden-set.ts';

/**
 * The golden set entries the text to SQL report runs: M1 and its follow ups.
 * Semantic and hybrid entries belong to the retrieval reports, and a later
 * milestone's SQL entries get their own report, so this one keeps measuring
 * the same questions from run to run.
 */
export const SQL_SELECTION: GoldenSelection = {
  slices: [
    GOLDEN_SLICE.STRUCTURED_FILTERS,
    GOLDEN_SLICE.AGGREGATES_AND_ORDERING,
    GOLDEN_SLICE.UNANSWERABLE,
    GOLDEN_SLICE.OUT_OF_SCOPE,
  ],
  milestones: ['M1', 'M1.1'],
};
