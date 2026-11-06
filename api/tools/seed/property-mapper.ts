import type { RawRow } from './raw-row.ts';
import {
  councilTaxBand,
  postcode,
  postcodeDistrict,
  propertyKind,
  townFromAddress,
} from './address.ts';
import { optionalCount, requireInt } from './numbers.ts';
import type { PropertyKind } from '../../src/contracts/index.ts';

/**
 * Listing flags worth keeping. Everything left out of this list is constant
 * across every listing and says nothing.
 *
 * A flag means "stated on the listing". False means the listing did not say so,
 * never that the property lacks it.
 */
export const PROPERTY_FLAGS = [
  'has_garage',
  'has_double_garage',
  'has_garden',
  'has_land',
  'has_central_heating',
  'is_parking_available',
  'has_on_street_parking',
  'has_off_street_parking',
  'has_ground_floor_bedroom_bathroom',
  'has_granny_flat',
  'has_green_energy',
  'has_electric_vehicle_charge_point',
  'is_self_contained',
  'is_new_build',
  'is_development',
  'is_development_opportunity',
] as const;

export type PropertyFlag = (typeof PROPERTY_FLAGS)[number];

interface PropertyRecord {
  id: number;
  full_address: string;
  post_code: string | null;
  postcode_district: string | null;
  town: string | null;
  price: number;
  area_m2: number | null;
  council_tax_band: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  public_rooms: number | null;
  property_kind: PropertyKind;
  house_floor: number | null;
}

/** One `properties` row as the seed writes it, distinct from the row ingestion reads back. */
export type PropertyInsert = PropertyRecord & Record<PropertyFlag, boolean>;

/** Column list in insert order, starting with the key column. */
export function propertyColumns(): string[] {
  return [
    'id',
    'full_address',
    'post_code',
    'postcode_district',
    'town',
    'price',
    'area_m2',
    'council_tax_band',
    'bedrooms',
    'bathrooms',
    'public_rooms',
    'property_kind',
    'house_floor',
    ...PROPERTY_FLAGS,
  ];
}

function flag(value: string | null): boolean {
  return value === '1';
}

/** Turns one raw listing row into the row we store. */
export function toPropertyInsert(raw: RawRow): PropertyInsert {
  const id = requireInt(raw['id'] ?? null, 'id', raw['id'] ?? '?');
  const address = (raw['full_address'] ?? '').replace(/\s+/g, ' ').trim();
  const bedrooms = optionalCount(raw['bedroom'] ?? null, 'bedroom', id);

  const record: PropertyRecord = {
    id,
    full_address: address,
    post_code: postcode(raw['post_code'] ?? null),
    postcode_district: postcodeDistrict(raw['post_code'] ?? null),
    town: townFromAddress(address),
    price: requireInt(raw['price'] ?? null, 'price', id),
    // Zero means the listing did not give a floor area.
    area_m2: optionalCount(raw['area_m2'] ?? null, 'area_m2', id),
    council_tax_band: councilTaxBand(raw['council_tax'] ?? null),
    bedrooms,
    bathrooms: optionalCount(raw['bathroom'] ?? null, 'bathroom', id),
    public_rooms: optionalCount(raw['publicroom'] ?? null, 'publicroom', id),
    property_kind: propertyKind(address, bedrooms),
    house_floor:
      raw['house_floor'] === null ? null : requireInt(raw['house_floor'], 'house_floor', id),
  };

  const flags = Object.fromEntries(
    PROPERTY_FLAGS.map((name) => [name, flag(raw[name] ?? null)]),
  ) as Record<PropertyFlag, boolean>;

  return { ...record, ...flags };
}

export interface DedupeResult {
  rows: PropertyInsert[];
  /** Ids dropped as repeats, with the id of the row that was kept. */
  dropped: { id: number; keptId: number; address: string }[];
}

/** Keeps the first listing for an address and reports the repeats. */
export function dedupeByAddress(rows: PropertyInsert[]): DedupeResult {
  const seen = new Map<string, number>();
  const kept: PropertyInsert[] = [];
  const dropped: DedupeResult['dropped'] = [];

  for (const row of rows) {
    const key = row.full_address.toLowerCase();
    const keptId = seen.get(key);
    if (keptId === undefined) {
      seen.set(key, row.id);
      kept.push(row);
    } else {
      dropped.push({ id: row.id, keptId, address: row.full_address });
    }
  }

  return { rows: kept, dropped };
}
