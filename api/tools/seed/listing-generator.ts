import {
  BEDROOM_WEIGHTS,
  COUNCIL_TAX_VALUES,
  FLAT_LETTERS,
  HEATING_ANSWERS,
  IMPOSSIBLE_INWARD_LETTERS,
  NO_ANSWERS,
  PARKING_ANSWERS,
  SELLER_DETAILS,
  STREET_NAMES,
  STREET_TYPES,
  SUPPLIERS,
  TOWNS,
  UNKNOWN_ANSWERS,
  YES_ANSWERS,
} from './listing-vocabulary.ts';
import type { RawRow } from './raw-row.ts';

/** Fixed, so a seed run always builds the same rows and the golden set stays valid. */
export const DEFAULT_SEED = 20_260_921;
export const DEFAULT_LISTING_COUNT = 800;

const PRICE_STEP = 500;
const BASE_PRICE = 45_000;
const PRICE_PER_BEDROOM = 48_000;
const PRICE_SPREAD = 90_000;
const AREA_BASE = 25;
const AREA_PER_BEDROOM = 28;
const AREA_SPREAD = 30;
const MAX_HOUSE_NUMBER = 180;
const MAX_INWARD_DIGIT = 9;
const MAX_PLOT_NUMBER = 9;
const MAX_STOREYS = 2;
const MAX_OWNERSHIP_YEARS = 30;
const BEDROOMS_PER_ROOM = 2;
// A large home in Aberdeen never lists below this, so that question has a true zero.
const LARGE_HOME_BEDROOMS = 5;
const LARGE_ABERDEEN_FLOOR = 180_000;
// Repeats an earlier address now and then, so the dedupe step has real work.
const DUPLICATE_EVERY = 90;
const UINT32_RANGE = 4_294_967_296;
// The constants that define Mulberry32. They have no meaning of their own.
const MULBERRY_INCREMENT = 0x6d2b79f5;
const MULBERRY_SHIFT_A = 15;
const MULBERRY_SHIFT_B = 7;
const MULBERRY_SHIFT_C = 14;
const MULBERRY_MULTIPLIER = 61;

const CHANCE = {
  plot: 0.04,
  commercial: 0.03,
  flat: 0.35,
  noArea: 0.06,
  questionnaire: 0.65,
  garage: 0.33,
  doubleGarageGivenGarage: 0.3,
  garden: 0.72,
  land: 0.06,
  centralHeating: 0.11,
  parking: 0.87,
  onStreet: 0.37,
  offStreet: 0.63,
  groundFloorBedroom: 0.25,
  grannyFlat: 0.05,
  greenEnergy: 0.04,
  evCharger: 0.05,
  newBuild: 0.05,
  developmentOpportunity: 0.04,
  selfContained: 0.05,
  answerYes: 0.2,
  answerUnknown: 0.08,
  detail: 0.35,
  supplierAsAnswer: 0.15,
  serviceYes: 0.88,
  mainsDrainageYes: 0.8,
  centralHeatingYes: 0.85,
  telephoneYes: 0.7,
} as const;

/** Questions only a seller can answer, in the column names the mappers read. */
const YES_NO_QUESTIONS = [
  'conservation_area_status',
  'listed_building_status',
  'windows_replaced',
  'maintenance_contract',
  'energy_performance_certificate',
  'structural_damage',
  'asbestos_presence',
  'shared_cost_responsibility',
  'major_roof_repairs',
  'common_building_insurance',
  'other_regular_charges',
  'specialist_work',
  'guarantee_available',
  'boundaries_moved',
  'received_notices',
  'public_right_of_way',
] as const;

/** Services most homes have, where a seller may write the supplier's name instead of yes. */
const SERVICE_QUESTIONS = [
  { column: 'gas_supply', supplier: 'gas_supplier' },
  { column: 'water_supply', supplier: 'water_supplier' },
  { column: 'electricity_supply', supplier: 'electricity_supplier' },
  { column: 'broadband', supplier: 'broadband_supplier' },
  { column: 'cable_tv_or_satellite', supplier: 'cable_tv_supplier' },
] as const;

type Random = () => number;
type Town = (typeof TOWNS)[number];
type ListingKind = 'home' | 'flat' | 'plot' | 'commercial';

/** Mulberry32: small and seeded, so the same rows come out on any machine. */
function createRandom(seed: number): Random {
  let state = seed;
  return (): number => {
    state = (state + MULBERRY_INCREMENT) | 0;
    let mixed = Math.imul(state ^ (state >>> MULBERRY_SHIFT_A), 1 | state);
    mixed =
      (mixed + Math.imul(mixed ^ (mixed >>> MULBERRY_SHIFT_B), MULBERRY_MULTIPLIER | mixed)) ^
      mixed;
    return ((mixed ^ (mixed >>> MULBERRY_SHIFT_C)) >>> 0) / UINT32_RANGE;
  };
}

function pick<T>(random: Random, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)];
}

function pickWeighted<T extends { weight: number }>(random: Random, values: readonly T[]): T {
  const total = values.reduce((sum, value) => sum + value.weight, 0);
  let left = random() * total;
  for (const value of values) {
    left -= value.weight;
    if (left < 0) {
      return value;
    }
  }
  return values[values.length - 1];
}

function upTo(random: Random, max: number): number {
  return 1 + Math.floor(random() * max);
}

function flag(random: Random, chance: number): string {
  return random() < chance ? '1' : '0';
}

function fakePostcode(random: Random, town: Town): string {
  const digit = String(upTo(random, MAX_INWARD_DIGIT));
  const letters = pick(random, IMPOSSIBLE_INWARD_LETTERS) + pick(random, IMPOSSIBLE_INWARD_LETTERS);
  return `${pick(random, town.districts)} ${digit}${letters}`;
}

function pickKind(random: Random, town: Town): ListingKind {
  const roll = random();
  if (roll < CHANCE.plot) {
    return 'plot';
  }
  // Stonehaven has no commercial units, so that question has a true zero.
  if (roll < CHANCE.plot + CHANCE.commercial && town.name !== 'Stonehaven') {
    return 'commercial';
  }
  return random() < CHANCE.flat ? 'flat' : 'home';
}

function firstLine(random: Random, kind: ListingKind): string {
  const street = `${pick(random, STREET_NAMES)} ${pick(random, STREET_TYPES)}`;
  const numbered = `${String(upTo(random, MAX_HOUSE_NUMBER))} ${street}`;
  switch (kind) {
    case 'plot':
      return `Plot ${String(upTo(random, MAX_PLOT_NUMBER))}, Land At ${street}`;
    case 'commercial':
      return `Commercial Premises, ${numbered}`;
    case 'flat':
      return `Flat ${pick(random, FLAT_LETTERS)}, ${numbered}`;
    case 'home':
      return numbered;
  }
}

function listingPrice(random: Random, bedrooms: number, town: Town): number {
  const asked = BASE_PRICE + bedrooms * PRICE_PER_BEDROOM + random() * PRICE_SPREAD;
  const large = town.name === 'Aberdeen' && bedrooms >= LARGE_HOME_BEDROOMS;
  const floor = large ? LARGE_ABERDEEN_FLOOR : town.floor;
  return Math.round(Math.max(asked, floor) / PRICE_STEP) * PRICE_STEP;
}

function toListing(random: Random, id: number): RawRow {
  const town = pickWeighted(random, TOWNS);
  const kind = pickKind(random, town);
  const isHome = kind === 'home' || kind === 'flat';
  const bedrooms = isHome ? pickWeighted(random, BEDROOM_WEIGHTS).value : 0;
  const otherRooms = isHome ? Math.max(1, Math.ceil(bedrooms / BEDROOMS_PER_ROOM)) : 0;
  const hasArea = isHome && random() >= CHANCE.noArea;
  const area = hasArea ? AREA_BASE + bedrooms * AREA_PER_BEDROOM + upTo(random, AREA_SPREAD) : 0;
  const postcode = fakePostcode(random, town);
  const garage = flag(random, CHANCE.garage);

  return {
    id: String(id),
    full_address: `${firstLine(random, kind)}, ${town.name}, ${postcode}`,
    post_code: postcode,
    price: String(listingPrice(random, bedrooms, town)),
    area_m2: String(area),
    council_tax: isHome ? pick(random, COUNCIL_TAX_VALUES) : 'NA',
    bedroom: String(bedrooms),
    bathroom: String(otherRooms),
    publicroom: String(otherRooms),
    house_floor: kind === 'home' ? String(upTo(random, MAX_STOREYS)) : null,
    has_garage: garage,
    has_double_garage: garage === '1' ? flag(random, CHANCE.doubleGarageGivenGarage) : '0',
    has_garden: flag(random, isHome ? CHANCE.garden : 0),
    has_land: flag(random, isHome ? CHANCE.land : 0),
    has_central_heating: flag(random, CHANCE.centralHeating),
    is_parking_available: flag(random, CHANCE.parking),
    has_on_street_parking: flag(random, CHANCE.onStreet),
    has_off_street_parking: flag(random, CHANCE.offStreet),
    has_ground_floor_bedroom_bathroom: flag(random, isHome ? CHANCE.groundFloorBedroom : 0),
    has_granny_flat: flag(random, kind === 'home' ? CHANCE.grannyFlat : 0),
    has_green_energy: flag(random, isHome ? CHANCE.greenEnergy : 0),
    has_electric_vehicle_charge_point: flag(random, isHome ? CHANCE.evCharger : 0),
    is_self_contained: flag(random, kind === 'flat' ? CHANCE.selfContained : 0),
    is_new_build: flag(random, isHome ? CHANCE.newBuild : 0),
    is_development: '0',
    is_development_opportunity: flag(random, isHome ? CHANCE.developmentOpportunity : 0),
  };
}

function yesNoAnswer(random: Random, column: string): string {
  const roll = random();
  if (roll < CHANCE.answerUnknown) {
    return pick(random, UNKNOWN_ANSWERS);
  }
  if (roll >= CHANCE.answerUnknown + CHANCE.answerYes) {
    return pick(random, NO_ANSWERS);
  }
  const details = SELLER_DETAILS.get(column);
  return details && random() < CHANCE.detail ? pick(random, details) : pick(random, YES_ANSWERS);
}

function serviceAnswer(random: Random, chanceOfYes: number, supplier: string | null): string {
  if (random() >= chanceOfYes) {
    return pick(random, NO_ANSWERS);
  }
  return supplier && random() < CHANCE.supplierAsAnswer ? supplier : pick(random, YES_ANSWERS);
}

function toQuestionnaire(random: Random, propertyId: number): RawRow {
  const row: RawRow = {
    property_id: String(propertyId),
    heating_type: pickWeighted(random, HEATING_ANSWERS).text,
    parking_arrangements: pick(random, PARKING_ANSWERS),
    length_of_ownership: `${String(upTo(random, MAX_OWNERSHIP_YEARS))} years`,
    central_heating_system: serviceAnswer(random, CHANCE.centralHeatingYes, null),
    mains_drainage: serviceAnswer(random, CHANCE.mainsDrainageYes, null),
    telephone: serviceAnswer(random, CHANCE.telephoneYes, null),
    heating_supplier: pick(random, SUPPLIERS.heating_supplier),
  };

  for (const column of YES_NO_QUESTIONS) {
    row[column] = yesNoAnswer(random, column);
  }
  for (const { column, supplier } of SERVICE_QUESTIONS) {
    const name = pick(random, SUPPLIERS[supplier]);
    row[supplier] = name;
    row[column] = serviceAnswer(random, CHANCE.serviceYes, name);
  }
  return row;
}

export interface GeneratedListings {
  properties: RawRow[];
  questionnaires: RawRow[];
}

/**
 * Builds made up listings in the raw shape the cleaning code reads, messy
 * answers included, so the same rules run on them as on any other source.
 */
export function generateListings(
  count: number = DEFAULT_LISTING_COUNT,
  seed: number = DEFAULT_SEED,
): GeneratedListings {
  const random = createRandom(seed);
  const properties: RawRow[] = [];
  const questionnaires: RawRow[] = [];

  for (let id = 1; id <= count; id++) {
    const previous = id % DUPLICATE_EVERY === 0 ? properties.at(-1) : undefined;
    properties.push(previous ? { ...previous, id: String(id) } : toListing(random, id));
    if (random() < CHANCE.questionnaire) {
      questionnaires.push(toQuestionnaire(random, id));
    }
  }

  return { properties, questionnaires };
}
