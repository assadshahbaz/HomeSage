import type { RawRow } from './raw-row.ts';
import { disclosureAnswer, heatingType, ownershipMonths, supplierName } from './answers.ts';
import { requireInt } from './numbers.ts';
import { freeText } from './personal-data.ts';
import type { HeatingType } from '../../src/contracts/index.ts';

/**
 * Seller questionnaire answers. Every answer starts as free text, so each one
 * becomes a
 * yes/no/unknown column plus the original sentence when it says more.
 */
interface AnswerSpec {
  /** Column in the raw row. */
  source: string;
  /** Column in our table, which also names the `_detail` column. */
  column: string;
  /** Whether a supplier's name in this field means the service is connected. */
  nameImpliesYes?: boolean;
}

export const ANSWERS: AnswerSpec[] = [
  { source: 'conservation_area_status', column: 'conservation_area' },
  { source: 'listed_building_status', column: 'listed_building' },
  { source: 'windows_replaced', column: 'windows_replaced' },
  { source: 'central_heating_system', column: 'central_heating' },
  { source: 'maintenance_contract', column: 'maintenance_contract', nameImpliesYes: true },
  { source: 'energy_performance_certificate', column: 'epc_available' },
  { source: 'structural_damage', column: 'structural_damage' },
  { source: 'asbestos_presence', column: 'asbestos' },
  { source: 'gas_supply', column: 'gas_supply', nameImpliesYes: true },
  { source: 'water_supply', column: 'water_supply', nameImpliesYes: true },
  { source: 'electricity_supply', column: 'electricity_supply', nameImpliesYes: true },
  { source: 'mains_drainage', column: 'mains_drainage', nameImpliesYes: true },
  { source: 'telephone', column: 'telephone_line', nameImpliesYes: true },
  { source: 'broadband', column: 'broadband', nameImpliesYes: true },
  { source: 'cable_tv_or_satellite', column: 'cable_tv', nameImpliesYes: true },
  { source: 'shared_cost_responsibility', column: 'shared_cost_responsibility' },
  { source: 'major_roof_repairs', column: 'major_roof_repairs' },
  { source: 'common_building_insurance', column: 'common_building_insurance' },
  { source: 'other_regular_charges', column: 'other_regular_charges' },
  { source: 'specialist_work', column: 'specialist_work' },
  { source: 'guarantee_available', column: 'guarantee_available' },
  { source: 'boundaries_moved', column: 'boundaries_moved' },
  { source: 'received_notices', column: 'received_notices' },
  { source: 'public_right_of_way', column: 'public_right_of_way' },
];

/**
 * Supplier fields we keep. `telephone_supplier` is left out on purpose, since
 * people write phone numbers there.
 */
export const SUPPLIERS: { source: string; column: string }[] = [
  { source: 'gas_supplier', column: 'gas_supplier' },
  { source: 'electricity_supplier', column: 'electricity_supplier' },
  { source: 'water_supplier', column: 'water_supplier' },
  { source: 'broadband_supplier', column: 'broadband_supplier' },
  { source: 'heating_supplier', column: 'heating_supplier' },
  { source: 'cable_tv_supplier', column: 'cable_tv_supplier' },
];

/**
 * One disclosures row as the seed writes it. The answer and detail columns are keyed by
 * name because they are generated from `ANSWERS`, so they cannot be listed here
 * without repeating that list.
 */
export interface DisclosureInsert {
  property_id: number;
  heating_type: HeatingType | null;
  parking_arrangements: string | null;
  ownership_months: number | null;
  [column: string]: string | number | null;
}

/** Turns one raw questionnaire row into the row we store. */
export function toDisclosureInsert(raw: RawRow): DisclosureInsert {
  const propertyId = requireInt(raw['property_id'] ?? null, 'property_id', raw['id'] ?? '?');

  const row: DisclosureInsert = {
    property_id: propertyId,
    heating_type: heatingType(raw['heating_type'] ?? null),
    parking_arrangements: freeText(raw['parking_arrangements'] ?? null),
    ownership_months: ownershipMonths(raw['length_of_ownership'] ?? null),
  };

  for (const answer of ANSWERS) {
    const parsed = disclosureAnswer(raw[answer.source] ?? null, {
      nameImpliesYes: answer.nameImpliesYes ?? false,
    });
    row[answer.column] = parsed.value;
    row[`${answer.column}_detail`] = parsed.detail === null ? null : freeText(parsed.detail);
  }

  // The questionnaire holds a separate free text field for notices, which is
  // more useful than the yes/no sentence it came with.
  const noticeDetail = freeText(raw['notice_details'] ?? null);
  if (noticeDetail !== null && noticeDetail.toLowerCase() !== 'no') {
    row['received_notices_detail'] = noticeDetail;
  }

  for (const supplier of SUPPLIERS) {
    row[supplier.column] = supplierName(raw[supplier.source] ?? null);
  }

  return row;
}

/** Column list in insert order, so the schema and the insert cannot drift. */
export function disclosureColumns(): string[] {
  return [
    'property_id',
    'heating_type',
    'parking_arrangements',
    'ownership_months',
    ...ANSWERS.flatMap((answer) => [answer.column, `${answer.column}_detail`]),
    ...SUPPLIERS.map((supplier) => supplier.column),
  ];
}
