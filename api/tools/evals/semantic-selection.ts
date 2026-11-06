import { GOLDEN_SLICE } from './golden-set.ts';
import type { GoldenSelection } from './golden-set.ts';

/**
 * The golden set entries the M2 semantic report runs. Hybrid entries and later
 * milestones' semantic entries belong to the M3 report, so this one keeps
 * measuring the same questions from run to run.
 */
export const SEMANTIC_SELECTION: GoldenSelection = {
  slices: [GOLDEN_SLICE.SEMANTIC],
  milestones: ['M2'],
};
