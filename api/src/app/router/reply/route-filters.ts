import {
  councilTaxBandSchema,
  propertyKindSchema,
  searchFiltersSchema,
} from '../../../contracts/index.js';
import type { SearchFilters } from '../../../contracts/index.js';
import type { FilterValues } from '../vocabulary/filter-vocabulary.js';

/** Why one filter, or one value of a list filter, was left out of the route. */
export const FILTER_DROP_REASON = {
  /** The model named a filter the search does not have. */
  UNKNOWN_FILTER: 'unknown_filter',
  /** A list value the data does not hold, such as a town with no listings. */
  UNKNOWN_VALUE: 'unknown_value',
  /** A value of the wrong type or range, or a flag set to false. */
  INVALID_VALUE: 'invalid_value',
  /** A minimum above its maximum, so both ends go. */
  INVERTED_RANGE: 'inverted_range',
} as const;

export type FilterDropReason = (typeof FILTER_DROP_REASON)[keyof typeof FILTER_DROP_REASON];

export interface DroppedFilter {
  readonly filter: string;
  readonly value: unknown;
  readonly reason: FilterDropReason;
}

/** The filters that survived, with the defaults applied, and what was dropped on the way. */
export interface CheckedFilters {
  readonly filters: SearchFilters;
  readonly dropped: readonly DroppedFilter[];
}

type FilterName = keyof typeof searchFiltersSchema.shape;

/** Maps one value of a list filter to its stored spelling, or null when the data does not hold it. */
type ListItemCheck = (item: unknown) => string | null;

/**
 * Checks the router model's filters one at a time, so one bad value costs only
 * that value and never the whole route. Towns and districts must be ones the
 * data holds and come back in its spelling. Nulls count as absent.
 */
export function checkRouteFilters(
  raw: Readonly<Record<string, unknown>>,
  values: FilterValues,
): CheckedFilters {
  const listChecks = listItemChecks(values);
  const kept = new Map<FilterName, unknown>();
  const dropped: DroppedFilter[] = [];

  for (const [filter, value] of Object.entries(raw)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (!isFilterName(filter)) {
      dropped.push({ filter, value, reason: FILTER_DROP_REASON.UNKNOWN_FILTER });
      continue;
    }

    const check = listChecks[filter];
    if (check !== undefined) {
      const known = new Set<string>();
      // A single value where a list belongs is read as a list of one.
      for (const item of Array.isArray(value) ? value : [value]) {
        const match = check(item);
        if (match === null) {
          dropped.push({ filter, value: item, reason: FILTER_DROP_REASON.UNKNOWN_VALUE });
        } else {
          known.add(match);
        }
      }
      if (known.size > 0) {
        kept.set(filter, [...known]);
      }
      continue;
    }

    const parsed = searchFiltersSchema.shape[filter].safeParse(value);
    if (parsed.success) {
      kept.set(filter, parsed.data);
    } else {
      dropped.push({ filter, value, reason: FILTER_DROP_REASON.INVALID_VALUE });
    }
  }

  dropInvertedRange(kept, 'minPrice', 'maxPrice', dropped);
  dropInvertedRange(kept, 'minBedrooms', 'maxBedrooms', dropped);

  return { filters: searchFiltersSchema.parse(Object.fromEntries(kept)), dropped };
}

function isFilterName(name: string): name is FilterName {
  return Object.hasOwn(searchFiltersSchema.shape, name);
}

function listItemChecks(values: FilterValues): Partial<Record<FilterName, ListItemCheck>> {
  const towns = new Map(values.towns.map((town) => [town.toLowerCase(), town]));
  const districts = new Set(values.postcodeDistricts);

  return {
    towns: (item) => (typeof item === 'string' ? (towns.get(normalised(item)) ?? null) : null),
    postcodeDistricts: (item) => {
      const district = typeof item === 'string' ? item.trim().toUpperCase() : null;
      return district !== null && districts.has(district) ? district : null;
    },
    councilTaxBands: (item) => {
      const band = councilTaxBandSchema.safeParse(
        typeof item === 'string' ? item.trim().toUpperCase() : item,
      );
      return band.success ? band.data : null;
    },
    propertyKinds: (item) => {
      const kind = propertyKindSchema.safeParse(typeof item === 'string' ? normalised(item) : item);
      return kind.success ? kind.data : null;
    },
  };
}

function normalised(text: string): string {
  return text.trim().toLowerCase();
}

function dropInvertedRange(
  kept: Map<FilterName, unknown>,
  min: FilterName,
  max: FilterName,
  dropped: DroppedFilter[],
): void {
  const low = kept.get(min);
  const high = kept.get(max);
  if (typeof low === 'number' && typeof high === 'number' && low > high) {
    dropped.push({ filter: min, value: low, reason: FILTER_DROP_REASON.INVERTED_RANGE });
    dropped.push({ filter: max, value: high, reason: FILTER_DROP_REASON.INVERTED_RANGE });
    kept.delete(min);
    kept.delete(max);
  }
}
