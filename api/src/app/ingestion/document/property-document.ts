import type { PropertyRow } from './property-row.js';

/**
 * What one property becomes in the search index, before it is embedded: the
 * paragraph BM25 and the embedding read, and the hard facts kNN is pre filtered
 * on. A `false` flag means the listing did not mention it, so a search may
 * filter on `true` only.
 */
export interface PropertyDocument {
  /** The property id as a string, also the index document id. */
  readonly id: string;
  readonly text: string;
  readonly price: number;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly public_rooms: number | null;
  readonly area_m2: number | null;
  readonly post_code: string | null;
  readonly postcode_district: string | null;
  readonly town: string | null;
  readonly council_tax_band: string | null;
  readonly property_kind: PropertyRow['property_kind'];
  readonly heating_type: string | null;
  readonly has_garden: boolean;
  readonly has_garage: boolean;
  readonly has_off_street_parking: boolean;
  readonly is_new_build: boolean;
  /** ISO 8601, from `properties.updated_at`. */
  readonly updated_at: string;
}
