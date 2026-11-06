import type { estypes } from '@elastic/elasticsearch';
import type { SearchFilters } from '../../../contracts/index.js';

/**
 * The request's filters as Elasticsearch filter clauses: unscored, so they
 * decide which documents can match without changing how a match ranks. kNN and
 * BM25 both build their filters here, so the two lists always cover the same
 * documents.
 */
export function filterClauses(filters: SearchFilters): estypes.QueryDslQueryContainer[] {
  const clauses: estypes.QueryDslQueryContainer[] = [
    { terms: { property_kind: filters.propertyKinds } },
  ];
  const price = range(filters.minPrice, filters.maxPrice);
  if (price !== null) {
    clauses.push({ range: { price } });
  }
  const bedrooms = range(filters.minBedrooms, filters.maxBedrooms);
  if (bedrooms !== null) {
    clauses.push({ range: { bedrooms } });
  }
  if (filters.postcodeDistricts !== undefined) {
    clauses.push({ terms: { postcode_district: filters.postcodeDistricts } });
  }
  if (filters.towns !== undefined) {
    // `town` is a keyword, so each name is matched ignoring case: "aberdeen" finds "Aberdeen".
    clauses.push({
      bool: {
        should: filters.towns.map((town) => ({
          term: { town: { value: town, case_insensitive: true } },
        })),
        minimum_should_match: 1,
      },
    });
  }
  if (filters.councilTaxBands !== undefined) {
    clauses.push({ terms: { council_tax_band: filters.councilTaxBands } });
  }
  const flags = [
    ['has_garden', filters.hasGarden],
    ['has_garage', filters.hasGarage],
    ['has_off_street_parking', filters.hasOffStreetParking],
    ['is_new_build', filters.isNewBuild],
  ] as const;
  for (const [field, wanted] of flags) {
    if (wanted === true) {
      clauses.push({ term: { [field]: true } });
    }
  }
  return clauses;
}

function range(
  min: number | undefined,
  max: number | undefined,
): estypes.QueryDslNumberRangeQuery | null {
  if (min === undefined && max === undefined) {
    return null;
  }
  return { gte: min, lte: max };
}
