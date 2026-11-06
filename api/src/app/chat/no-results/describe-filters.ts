import { PROPERTY_KIND } from '../../../contracts/index.js';
import type { PropertyKind, SearchFilters } from '../../../contracts/index.js';

const PRICE = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

const KIND_NAME: Readonly<Record<PropertyKind, string>> = {
  [PROPERTY_KIND.RESIDENTIAL]: 'homes',
  [PROPERTY_KIND.PLOT]: 'plots',
  [PROPERTY_KIND.COMMERCIAL]: 'commercial units',
  [PROPERTY_KIND.OTHER]: 'other listings',
};

const FLAG_PHRASES = [
  ['hasGarden', 'with a garden'],
  ['hasGarage', 'with a garage'],
  ['hasOffStreetParking', 'with off street parking'],
  ['isNewBuild', 'new build'],
] as const satisfies readonly (readonly [keyof SearchFilters, string])[];

/** "A", "A or B", "A, B or C". */
function anyOf(items: readonly string[]): string {
  return items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} or ${items.at(-1) ?? ''}`;
}

function bedrooms(count: number): string {
  return `${String(count)} ${count === 1 ? 'bedroom' : 'bedrooms'}`;
}

function priceRange(min: number | undefined, max: number | undefined): string | null {
  if (min !== undefined && max !== undefined) {
    return `between ${PRICE.format(min)} and ${PRICE.format(max)}`;
  }
  if (min !== undefined) {
    return `${PRICE.format(min)} or more`;
  }
  return max === undefined ? null : `up to ${PRICE.format(max)}`;
}

function bedroomRange(min: number | undefined, max: number | undefined): string | null {
  if (min !== undefined && max !== undefined) {
    return min === max ? bedrooms(min) : `${String(min)} to ${String(max)} bedrooms`;
  }
  if (min !== undefined) {
    return `at least ${bedrooms(min)}`;
  }
  return max === undefined ? null : `at most ${bedrooms(max)}`;
}

/**
 * The applied filters as short phrases a person can read, such as "in
 * Westhill" and "up to £50,000", so a reply can name what to loosen. The
 * default of homes only is left out, since the person did not ask for it.
 */
export function describeFilters(filters: SearchFilters): string[] {
  const kinds = filters.propertyKinds;
  const defaultKinds = kinds.length === 1 && kinds[0] === PROPERTY_KIND.RESIDENTIAL;
  const flags = FLAG_PHRASES.flatMap(([name, phrase]) => (filters[name] === true ? [phrase] : []));
  return [
    defaultKinds ? null : anyOf(kinds.map((kind) => KIND_NAME[kind])),
    filters.towns ? `in ${anyOf(filters.towns)}` : null,
    filters.postcodeDistricts ? `in ${anyOf(filters.postcodeDistricts)}` : null,
    priceRange(filters.minPrice, filters.maxPrice),
    bedroomRange(filters.minBedrooms, filters.maxBedrooms),
    filters.councilTaxBands ? `in council tax band ${anyOf(filters.councilTaxBands)}` : null,
    ...flags,
  ].filter((phrase): phrase is string => phrase !== null);
}
