import type { PropertyKind, PropertySummary, SearchFilters } from '../../../contracts/index.js';

/** The name of a router filter, as `SearchFilters` spells it. */
export type FilterName = keyof SearchFilters;

const FLAGS = ['hasGarden', 'hasGarage', 'hasOffStreetParking', 'isNewBuild'] as const;

/**
 * Every router filter a property fails, with the meaning `filterClauses` gives
 * each one in the searches: ranges are inclusive, towns match ignoring case,
 * and a flag only ever asks for the feature to be stated. A property with no
 * bedroom count fails a bedroom filter, as it cannot match the range in the
 * index either. Empty when the property passes them all.
 */
export function filterViolations(
  card: PropertySummary,
  kind: PropertyKind,
  filters: SearchFilters,
): FilterName[] {
  const failed: FilterName[] = [];
  const fail = (name: FilterName, passes: boolean): void => {
    if (!passes) {
      failed.push(name);
    }
  };

  fail('propertyKinds', filters.propertyKinds.includes(kind));
  if (filters.minPrice !== undefined) {
    fail('minPrice', card.price >= filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    fail('maxPrice', card.price <= filters.maxPrice);
  }
  if (filters.minBedrooms !== undefined) {
    fail('minBedrooms', card.bedrooms !== null && card.bedrooms >= filters.minBedrooms);
  }
  if (filters.maxBedrooms !== undefined) {
    fail('maxBedrooms', card.bedrooms !== null && card.bedrooms <= filters.maxBedrooms);
  }
  if (filters.postcodeDistricts !== undefined) {
    fail(
      'postcodeDistricts',
      card.postcodeDistrict !== null && filters.postcodeDistricts.includes(card.postcodeDistrict),
    );
  }
  if (filters.towns !== undefined) {
    const town = card.town?.toLowerCase();
    fail(
      'towns',
      filters.towns.some((wanted) => wanted.toLowerCase() === town),
    );
  }
  if (filters.councilTaxBands !== undefined) {
    fail(
      'councilTaxBands',
      card.councilTaxBand !== null && filters.councilTaxBands.includes(card.councilTaxBand),
    );
  }
  for (const flag of FLAGS) {
    if (filters[flag] === true) {
      fail(flag, card[flag]);
    }
  }
  return failed;
}
