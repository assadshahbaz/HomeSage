import { Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import {
  councilTaxBandSchema,
  heatingTypeSchema,
  propertyKindSchema,
} from '../../../contracts/index.js';
import type { PropertyKind, PropertySummary } from '../../../contracts/index.js';
import { MysqlService } from '../../../infra/mysql/mysql.service.js';

// A fixed statement over the read only account with the ids bound, never model
// output, so it does not pass through the SQL validator. The questionnaire is
// joined for the heating type, which the listing flag badly under reports.
// The kind is read for the filter check and stays off the card.
const CARDS_SQL = `SELECT p.id, p.property_kind, p.full_address, p.price, p.bedrooms, p.bathrooms, p.public_rooms,
  p.area_m2, p.town, p.postcode_district, p.council_tax_band, d.heating_type,
  p.has_garden, p.has_garage, p.has_double_garage, p.has_off_street_parking, p.has_land,
  p.has_ground_floor_bedroom_bathroom, p.has_granny_flat, p.has_green_energy,
  p.has_electric_vehicle_charge_point, p.is_new_build
FROM properties p LEFT JOIN property_disclosures d ON d.property_id = p.id
WHERE p.id IN (?)`;

// mysql2 returns BOOLEAN columns as 0 or 1.
const flag = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform((value) => value === true || value === 1);
const count = z.number().int().nonnegative().nullable();

const cardRowSchema = z.object({
  id: z.number().int().positive(),
  property_kind: propertyKindSchema,
  full_address: z.string().min(1),
  price: z.number().int().nonnegative(),
  bedrooms: count,
  bathrooms: count,
  public_rooms: count,
  area_m2: count,
  town: z.string().nullable(),
  postcode_district: z.string().nullable(),
  council_tax_band: councilTaxBandSchema.nullable(),
  heating_type: heatingTypeSchema.nullable(),
  has_garden: flag,
  has_garage: flag,
  has_double_garage: flag,
  has_off_street_parking: flag,
  has_land: flag,
  has_ground_floor_bedroom_bathroom: flag,
  has_granny_flat: flag,
  has_green_energy: flag,
  has_electric_vehicle_charge_point: flag,
  is_new_build: flag,
});

/** A property's card, with the kind the card does not show. */
export interface ReadCard {
  readonly card: PropertySummary;
  readonly kind: PropertyKind;
}

/**
 * Reads what a property card shows from MySQL, the source of truth, rather
 * than from the search index, which can lag behind it.
 */
@Injectable()
export class PropertyCardReader {
  public constructor(private readonly mysql: MysqlService) {}

  /**
   * The cards for `ids`, in the order given. An id with no row, such as a
   * property deleted since it was indexed, is left out.
   */
  public async read(ids: readonly string[]): Promise<ReadCard[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.mysql.query<RowDataPacket>(CARDS_SQL, [ids.map(Number)]);
    const cards = new Map(
      rows.map((row) => {
        const parsed = cardRowSchema.parse(row);
        return [String(parsed.id), { card: toCard(parsed), kind: parsed.property_kind }] as const;
      }),
    );
    return ids.flatMap((id) => cards.get(id) ?? []);
  }
}

function toCard(row: z.infer<typeof cardRowSchema>): PropertySummary {
  return {
    id: String(row.id),
    address: row.full_address,
    price: row.price,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    publicRooms: row.public_rooms,
    areaM2: row.area_m2,
    town: row.town,
    postcodeDistrict: row.postcode_district,
    councilTaxBand: row.council_tax_band,
    heatingType: row.heating_type,
    hasGarden: row.has_garden,
    hasGarage: row.has_garage,
    hasDoubleGarage: row.has_double_garage,
    hasOffStreetParking: row.has_off_street_parking,
    hasLand: row.has_land,
    hasGroundFloorBedroomBathroom: row.has_ground_floor_bedroom_bathroom,
    hasGrannyFlat: row.has_granny_flat,
    hasGreenEnergy: row.has_green_energy,
    hasElectricVehicleChargePoint: row.has_electric_vehicle_charge_point,
    isNewBuild: row.is_new_build,
  };
}
