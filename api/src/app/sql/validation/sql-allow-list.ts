/**
 * Every table and column generated SQL may touch, taken from the `SQL` column
 * of `docs/schema.md`. The validator judges a query against this structure and
 * the prompt describes the schema from it, so the rules the model is told and
 * the rules it is held to cannot drift apart. A column written down here and
 * nowhere else in the doc, or the other way round, fails a test.
 */

import { DISCLOSURE_ANSWER, HEATING_TYPE, PROPERTY_KIND } from '../../../contracts/index.js';

/** A MySQL ENUM type written from one of the value sets the contracts own. */
function sqlEnum(values: Readonly<Record<string, string>>): string {
  return `ENUM(${Object.values(values)
    .map((value) => `'${value}'`)
    .join(',')})`;
}

/** The four answers every seller questionnaire column uses. */
const ANSWER = sqlEnum(DISCLOSURE_ANSWER);

/** A column a generated query may read, with what the prompt needs to use it. */
export interface AllowedColumn {
  readonly type: string;
  readonly nullable: boolean;
  readonly note: string;
}

/** A table a generated query may read. */
export interface AllowedTable {
  readonly alias: string;
  readonly summary: string;
  readonly columns: Readonly<Record<string, AllowedColumn>>;
}

export const SQL_ALLOW_LIST = {
  properties: {
    alias: 'p',
    summary: 'one row per listing',
    columns: {
      id: { type: 'INT UNSIGNED', nullable: false, note: 'listing id, cited as [P-1]' },
      full_address: {
        type: 'VARCHAR(255)',
        nullable: false,
        note: 'street address, town and postcode as listed, with inconsistent punctuation',
      },
      post_code: { type: 'VARCHAR(10)', nullable: true, note: 'full postcode, such as AB21 9CK' },
      postcode_district: {
        type: 'VARCHAR(5)',
        nullable: true,
        note: 'outward code, such as AB15',
      },
      town: {
        type: 'VARCHAR(60)',
        nullable: true,
        note: 'one of a fixed list of known towns, such as Aberdeen, Inverurie or Peterhead; NULL where no known town appears in the address',
      },
      price: {
        type: 'INT UNSIGNED',
        nullable: false,
        note: 'asking price in whole pounds',
      },
      area_m2: {
        type: 'SMALLINT UNSIGNED',
        nullable: true,
        note: 'floor area in whole square metres',
      },
      council_tax_band: { type: 'CHAR(1)', nullable: true, note: 'Scottish band, A to H' },
      bedrooms: {
        type: 'TINYINT UNSIGNED',
        nullable: true,
        note: 'count; NULL mostly on plots and commercial units',
      },
      bathrooms: { type: 'TINYINT UNSIGNED', nullable: true, note: 'count' },
      public_rooms: {
        type: 'TINYINT UNSIGNED',
        nullable: true,
        note: 'count of lounges, dining rooms and similar',
      },
      property_kind: {
        type: sqlEnum(PROPERTY_KIND),
        nullable: false,
        note: 'guessed from words in the address; filter on it to exclude plots and commercial units, never to state what a property is',
      },
      has_garage: { type: 'BOOLEAN', nullable: false, note: 'a garage of any size' },
      has_double_garage: { type: 'BOOLEAN', nullable: false, note: 'a double garage' },
      has_garden: { type: 'BOOLEAN', nullable: false, note: 'a garden of any size' },
      has_land: { type: 'BOOLEAN', nullable: false, note: 'a paddock, field or similar' },
      has_central_heating: {
        type: 'BOOLEAN',
        nullable: false,
        note: 'badly under reported, so prefer d.central_heating',
      },
      is_parking_available: { type: 'BOOLEAN', nullable: false, note: 'parking of any sort' },
      has_on_street_parking: { type: 'BOOLEAN', nullable: false, note: 'parking on the street' },
      has_off_street_parking: {
        type: 'BOOLEAN',
        nullable: false,
        note: 'a driveway or private space',
      },
      has_ground_floor_bedroom_bathroom: {
        type: 'BOOLEAN',
        nullable: false,
        note: 'the closest thing this data has to an accessibility signal',
      },
      has_granny_flat: { type: 'BOOLEAN', nullable: false, note: 'an annexe or granny flat' },
      has_green_energy: {
        type: 'BOOLEAN',
        nullable: false,
        note: 'solar, a heat pump or similar; the kind is not recorded',
      },
      has_electric_vehicle_charge_point: {
        type: 'BOOLEAN',
        nullable: false,
        note: 'an electric vehicle charge point',
      },
      is_self_contained: { type: 'BOOLEAN', nullable: false, note: 'self contained accommodation' },
      is_new_build: { type: 'BOOLEAN', nullable: false, note: 'a new build' },
      is_development: { type: 'BOOLEAN', nullable: false, note: 'part of a development' },
      is_development_opportunity: {
        type: 'BOOLEAN',
        nullable: false,
        note: 'sold as a development opportunity',
      },
    },
  },
  property_disclosures: {
    alias: 'd',
    summary:
      'one row per listing that had a seller questionnaire; listings without one have no row',
    columns: {
      property_id: { type: 'INT UNSIGNED', nullable: false, note: 'join key to properties.id' },
      heating_type: {
        type: sqlEnum(HEATING_TYPE),
        nullable: true,
        note: 'bucketed from the seller wording',
      },
      ownership_months: {
        type: 'SMALLINT UNSIGNED',
        nullable: true,
        note: 'how long the seller owned the property, in months; NULL where the seller gave a start date instead',
      },
      conservation_area: { type: ANSWER, nullable: false, note: 'in a conservation area' },
      listed_building: { type: ANSWER, nullable: false, note: 'a listed building' },
      windows_replaced: {
        type: ANSWER,
        nullable: false,
        note: 'windows replaced during this ownership',
      },
      central_heating: {
        type: ANSWER,
        nullable: false,
        note: 'more reliable than p.has_central_heating',
      },
      maintenance_contract: {
        type: ANSWER,
        nullable: false,
        note: 'a maintenance contract on the heating or similar',
      },
      epc_available: {
        type: ANSWER,
        nullable: false,
        note: 'whether a certificate exists; the data holds no EPC rating anywhere',
      },
      structural_damage: {
        type: ANSWER,
        nullable: false,
        note: 'storm, flood or burst pipe damage',
      },
      asbestos: { type: ANSWER, nullable: false, note: 'asbestos, usually a garage or shed roof' },
      gas_supply: { type: ANSWER, nullable: false, note: 'a gas supply' },
      water_supply: { type: ANSWER, nullable: false, note: 'a water supply' },
      electricity_supply: { type: ANSWER, nullable: false, note: 'an electricity supply' },
      mains_drainage: { type: ANSWER, nullable: false, note: 'a no usually means a septic tank' },
      telephone_line: { type: ANSWER, nullable: false, note: 'whether a line exists' },
      broadband: { type: ANSWER, nullable: false, note: 'a broadband connection' },
      cable_tv: { type: ANSWER, nullable: false, note: 'cable or satellite television' },
      shared_cost_responsibility: {
        type: ANSWER,
        nullable: false,
        note: 'shares the cost of common repairs, mostly flats',
      },
      major_roof_repairs: { type: ANSWER, nullable: false, note: 'major roof repairs were done' },
      common_building_insurance: {
        type: ANSWER,
        nullable: false,
        note: 'a common building insurance policy',
      },
      other_regular_charges: { type: ANSWER, nullable: false, note: 'factor fees and similar' },
      specialist_work: { type: ANSWER, nullable: false, note: 'damp, rot or roof work' },
      guarantee_available: { type: ANSWER, nullable: false, note: 'a guarantee on work done' },
      boundaries_moved: { type: ANSWER, nullable: false, note: 'a boundary was moved' },
      received_notices: {
        type: ANSWER,
        nullable: false,
        note: 'mostly neighbouring planning applications',
      },
      public_right_of_way: { type: ANSWER, nullable: false, note: 'shared paths and driveways' },
    },
  },
} as const satisfies Readonly<Record<string, AllowedTable>>;

export type AllowedTableName = keyof typeof SQL_ALLOW_LIST;

/** The only relationship in the database. Nothing else joins. */
export const SQL_JOIN = {
  left: { table: 'properties', column: 'id' },
  right: { table: 'property_disclosures', column: 'property_id' },
} as const satisfies Readonly<
  Record<'left' | 'right', { table: AllowedTableName; column: string }>
>;

// `Object.keys` widens to `string`, and the keys of the allow list are the table names.
const TABLE_NAMES = Object.keys(SQL_ALLOW_LIST) as readonly AllowedTableName[];

/** Names of the tables a generated query may read, in schema order. */
export function allowedTables(): readonly AllowedTableName[] {
  return TABLE_NAMES;
}

/** True when a generated query may read this table. */
export function isAllowedTable(table: string): table is AllowedTableName {
  return Object.hasOwn(SQL_ALLOW_LIST, table);
}

/** Names of the columns a generated query may read on this table, in schema order. */
export function allowedColumns(table: AllowedTableName): readonly string[] {
  return Object.keys(SQL_ALLOW_LIST[table].columns);
}

/**
 * True when a generated query may read this column. An unqualified column is
 * allowed when any allow listed table has it, since the query decides which
 * table it came from.
 */
export function isAllowedColumn(column: string, table?: string): boolean {
  if (table === undefined) {
    return TABLE_NAMES.some((name) => isAllowedColumn(column, name));
  }
  return isAllowedTable(table) && Object.hasOwn(SQL_ALLOW_LIST[table].columns, column);
}
