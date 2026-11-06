import type { PropertySummary } from '@api/contracts';

/**
 * The properties an answer cited, in the order it cited them. A property that
 * was retrieved but not cited never gets a card, a cited id with no property is
 * skipped, and an id cited twice gives one card.
 */
export function citedProperties(
  citedIds: readonly string[],
  properties: readonly PropertySummary[],
): PropertySummary[] {
  const byId = new Map(properties.map((property) => [property.id, property]));
  return [...new Set(citedIds)]
    .map((id) => byId.get(id))
    .filter((property) => property !== undefined);
}
