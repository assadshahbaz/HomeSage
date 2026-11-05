import { isDeepStrictEqual } from 'node:util';
import { CHAT_INTENT, PROPERTY_KIND } from '../../src/contracts/index.ts';
import type { Route } from '../../src/app/router/route.ts';
import type { RouteExpectation } from './route-expectation.ts';

/** What happened to one filter on one question. */
export const FILTER_OUTCOME = {
  /** Expected, and came back with the expected value. */
  MATCHED: 'matched',
  /** Expected, and came back with another value. */
  WRONG: 'wrong',
  /** Expected, and did not come back. */
  MISSED: 'missed',
  /** Came back without being expected. */
  EXTRA: 'extra',
} as const;

export type FilterOutcome = (typeof FILTER_OUTCOME)[keyof typeof FILTER_OUTCOME];

export interface FilterScore {
  readonly filter: string;
  readonly outcome: FilterOutcome;
}

/** One question's route against what was expected of it. */
export interface RouteScore {
  readonly intentCorrect: boolean;
  /** Empty when no filters were expected or the question was rightly declined. */
  readonly filters: readonly FilterScore[];
}

/** Precision and recall of one filter across a run. */
export interface FilterTally {
  readonly filter: string;
  readonly matched: number;
  readonly wrong: number;
  readonly missed: number;
  readonly extra: number;
}

const PROPERTY_KINDS = 'propertyKinds';
// The search adds this on its own, so it only counts when a question asks for something else.
const DEFAULT_KINDS = [PROPERTY_KIND.RESIDENTIAL];

/**
 * Scores a route. The intent is right when it is one of the acceptable ones.
 * Filters are scored only when the expectation lists them and the router did
 * not rightly decline: each expected filter is matched, wrong or missed, and
 * each other filter is extra, except the default property kinds.
 */
export function scoreRoute(expected: RouteExpectation, route: Route): RouteScore {
  const intentCorrect = expected.intents.includes(route.intent);
  if (expected.filters === undefined || route.intent === CHAT_INTENT.OUT_OF_SCOPE) {
    return { intentCorrect, filters: [] };
  }

  const produced = new Map<string, unknown>(Object.entries(route.filters));
  const filters: FilterScore[] = [];
  for (const [filter, value] of Object.entries(expected.filters)) {
    const actual = produced.get(filter);
    filters.push({
      filter,
      outcome:
        actual === undefined
          ? FILTER_OUTCOME.MISSED
          : sameValue(actual, value)
            ? FILTER_OUTCOME.MATCHED
            : FILTER_OUTCOME.WRONG,
    });
  }
  for (const [filter, value] of produced) {
    const isDefault = filter === PROPERTY_KINDS && sameValue(value, DEFAULT_KINDS);
    if (!(filter in expected.filters) && !isDefault) {
      filters.push({ filter, outcome: FILTER_OUTCOME.EXTRA });
    }
  }
  return { intentCorrect, filters };
}

/** Adds up the filter outcomes of a run, one row per filter, by name. */
export function tallyFilters(scores: readonly RouteScore[]): FilterTally[] {
  const tallies = new Map<string, Record<FilterOutcome, number>>();
  for (const { filter, outcome } of scores.flatMap((score) => score.filters)) {
    const tally = tallies.get(filter) ?? { matched: 0, wrong: 0, missed: 0, extra: 0 };
    tally[outcome] += 1;
    tallies.set(filter, tally);
  }
  return [...tallies]
    .map(([filter, tally]) => ({ filter, ...tally }))
    .sort((a, b) => a.filter.localeCompare(b.filter));
}

// Lists are compared as sets: the order the router names towns in does not matter.
function sameValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return isDeepStrictEqual(sortedStrings(actual), sortedStrings(expected));
  }
  return isDeepStrictEqual(actual, expected);
}

function sortedStrings(values: readonly unknown[]): string[] {
  return values.map(String).sort();
}
