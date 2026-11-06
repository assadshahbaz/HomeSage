import type { PropertySummary } from '@api/contracts';

import type { CountUnit } from '../../format/count';
import { formatCount } from '../../format/count';

/** How each room count on a card is written. */
export const ROOM_UNITS = {
  bedrooms: { one: 'bedroom', many: 'bedrooms' },
  bathrooms: { one: 'bathroom', many: 'bathrooms' },
  publicRooms: { one: 'public room', many: 'public rooms' },
} as const satisfies Record<string, CountUnit>;

/**
 * The size line of a card, "3 bedrooms, 2 bathrooms, 1 public room, 97 m²",
 * skipping anything the listing did not give. Null when it gave none of it.
 */
export function describeSize(summary: PropertySummary): string | null {
  const parts = [
    formatCount(summary.bedrooms, ROOM_UNITS.bedrooms),
    formatCount(summary.bathrooms, ROOM_UNITS.bathrooms),
    formatCount(summary.publicRooms, ROOM_UNITS.publicRooms),
    summary.areaM2 === null ? null : `${summary.areaM2} m²`,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Town and postcode district, "Aberdeen, AB21". Null when neither is known. */
export function describePlace(summary: PropertySummary): string | null {
  const parts = [summary.town, summary.postcodeDistrict].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** The council tax band as a card writes it, or null when the listing gave none. */
export function describeCouncilTax(summary: PropertySummary): string | null {
  return summary.councilTaxBand === null ? null : `Council tax band ${summary.councilTaxBand}`;
}
