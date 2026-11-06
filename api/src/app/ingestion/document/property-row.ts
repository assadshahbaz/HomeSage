import { z } from 'zod';
import {
  disclosureAnswerSchema,
  heatingTypeSchema,
  propertyKindSchema,
} from '../../../contracts/index.js';

// mysql2 returns BOOLEAN columns as 0 or 1.
const flag = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform((value) => value === true || value === 1);
const count = z.number().int().nonnegative().nullable();
const answer = disclosureAnswerSchema;
const text = z.string().nullable();

/** One `properties` row, as the ingestion query selects it. Columns it does not use are dropped. */
export const propertyRowSchema = z.object({
  id: z.number().int().positive(),
  full_address: z.string().min(1),
  post_code: text,
  postcode_district: text,
  town: text,
  price: z.number().int().nonnegative(),
  area_m2: count,
  council_tax_band: text,
  bedrooms: count,
  bathrooms: count,
  public_rooms: count,
  property_kind: propertyKindSchema,
  has_garage: flag,
  has_double_garage: flag,
  has_garden: flag,
  has_land: flag,
  has_central_heating: flag,
  is_parking_available: flag,
  has_on_street_parking: flag,
  has_off_street_parking: flag,
  has_ground_floor_bedroom_bathroom: flag,
  has_granny_flat: flag,
  has_green_energy: flag,
  has_electric_vehicle_charge_point: flag,
  is_self_contained: flag,
  is_new_build: flag,
  is_development: flag,
  is_development_opportunity: flag,
  updated_at: z.date(),
});

/**
 * One `property_disclosures` row, limited to the columns the document uses.
 * Suppliers, ownership length and the utility answers are left out on purpose,
 * so they cannot reach the index by accident.
 */
export const disclosureRowSchema = z.object({
  property_id: z.number().int().positive(),
  heating_type: heatingTypeSchema.nullable(),
  parking_arrangements: text,
  central_heating: answer,
  central_heating_detail: text,
  conservation_area: answer,
  conservation_area_detail: text,
  listed_building: answer,
  listed_building_detail: text,
  windows_replaced: answer,
  windows_replaced_detail: text,
  maintenance_contract: answer,
  maintenance_contract_detail: text,
  structural_damage: answer,
  structural_damage_detail: text,
  asbestos: answer,
  asbestos_detail: text,
  mains_drainage: answer,
  mains_drainage_detail: text,
  shared_cost_responsibility: answer,
  shared_cost_responsibility_detail: text,
  major_roof_repairs: answer,
  major_roof_repairs_detail: text,
  common_building_insurance: answer,
  common_building_insurance_detail: text,
  other_regular_charges: answer,
  other_regular_charges_detail: text,
  specialist_work: answer,
  specialist_work_detail: text,
  guarantee_available: answer,
  guarantee_available_detail: text,
  boundaries_moved: answer,
  boundaries_moved_detail: text,
  received_notices: answer,
  received_notices_detail: text,
  public_right_of_way: answer,
  public_right_of_way_detail: text,
});

export type PropertyRow = z.infer<typeof propertyRowSchema>;
export type DisclosureRow = z.infer<typeof disclosureRowSchema>;
