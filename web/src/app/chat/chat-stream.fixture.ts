import type { ChatEvent, PropertySummary } from '@api/contracts';

// Real listings from the local database, as `retrieval` sends them.
const WRENFIELD_STREET: PropertySummary = {
  id: '523',
  address: 'Ground Floor Flat, 357 Wrenfield Street Aberdeen, AB10 7CK',
  price: 130_000,
  bedrooms: 2,
  bathrooms: 1,
  publicRooms: 1,
  areaM2: 69,
  town: 'Aberdeen',
  postcodeDistrict: 'AB10',
  councilTaxBand: 'C',
  heatingType: null,
  hasGarden: true,
  hasGarage: false,
  hasDoubleGarage: false,
  hasOffStreetParking: false,
  hasLand: false,
  hasGroundFloorBedroomBathroom: true,
  hasGrannyFlat: false,
  hasGreenEnergy: false,
  hasElectricVehicleChargePoint: false,
  isNewBuild: false,
};

const HARBOUR_RESIDENCE: PropertySummary = {
  id: '663',
  address: 'Flat 9, Harbour Residence, Fernlea Grove Aberdeen, AB10 6CV',
  price: 230_000,
  bedrooms: 2,
  bathrooms: 2,
  publicRooms: 1,
  areaM2: 72,
  town: 'Aberdeen',
  postcodeDistrict: 'AB10',
  councilTaxBand: 'E',
  heatingType: null,
  hasGarden: true,
  hasGarage: false,
  hasDoubleGarage: false,
  hasOffStreetParking: true,
  hasLand: false,
  hasGroundFloorBedroomBathroom: false,
  hasGrannyFlat: false,
  hasGreenEnergy: false,
  hasElectricVehicleChargePoint: true,
  isNewBuild: false,
};

const PENNANT_ROAD: PropertySummary = {
  id: '6',
  address: 'Flat B, 60 Pennant Road Aberdeen, AB11 8CK',
  price: 40_000,
  bedrooms: 1,
  bathrooms: 1,
  publicRooms: 1,
  areaM2: 40,
  town: 'Aberdeen',
  postcodeDistrict: 'AB11',
  councilTaxBand: 'A',
  heatingType: 'electric',
  hasGarden: true,
  hasGarage: false,
  hasDoubleGarage: false,
  hasOffStreetParking: false,
  hasLand: false,
  hasGroundFloorBedroomBathroom: true,
  hasGrannyFlat: false,
  hasGreenEnergy: false,
  hasElectricVehicleChargePoint: false,
  isNewBuild: false,
};

/**
 * A hybrid answer: three properties retrieved, two cited. Pennant Road is
 * retrieved but not cited, so it must not get a card.
 */
export const PROPERTIES_STREAM: readonly ChatEvent[] = [
  {
    type: 'route',
    intent: 'hybrid',
    filters: {
      towns: ['Aberdeen'],
      maxPrice: 250_000,
      hasGarden: true,
      propertyKinds: ['residential'],
    },
    standaloneQuestion: 'flats in Aberdeen with a garden under £250,000',
    fallback: null,
  },
  {
    type: 'retrieval',
    kind: 'properties',
    properties: [WRENFIELD_STREET, HARBOUR_RESIDENCE, PENNANT_ROAD],
    ranking: 'fused',
  },
  { type: 'token', text: 'Two flats stand out. The ground floor flat on Wrenfield Street ' },
  {
    type: 'token',
    text: 'is £130,000, with a garden and a ground floor bedroom and bathroom [P-523]. ',
  },
  {
    type: 'token',
    text: 'Flat 9 at Harbour Residence is £230,000, with a garden, off street parking and an EV charge point [P-',
  },
  { type: 'token', text: '663].' },
  { type: 'citations', kind: 'properties', ids: ['523', '663'] },
  { type: 'done' },
];

const STONEHAVEN_COUNT_SQL =
  "SELECT COUNT(*) AS listings FROM properties p WHERE p.town = 'Stonehaven' AND p.property_kind = 'residential' LIMIT 50";

/** An aggregate answer: a count cites its query as `[SQL]`, never a property. */
export const AGGREGATE_STREAM: readonly ChatEvent[] = [
  {
    type: 'route',
    intent: 'structured',
    filters: { towns: ['Stonehaven'], propertyKinds: ['residential'] },
    standaloneQuestion: 'How many homes are listed in Stonehaven?',
    fallback: null,
  },
  {
    type: 'retrieval',
    kind: 'aggregate',
    sql: STONEHAVEN_COUNT_SQL,
    values: [{ listings: 53 }],
    listingCount: 53,
  },
  { type: 'token', text: 'There are 53 homes listed in Stonehaven [SQL].' },
  { type: 'citations', kind: 'aggregate', sql: STONEHAVEN_COUNT_SQL, listingCount: 53 },
  { type: 'done' },
];

/** Nothing matched: fixed text naming the filters, no answer model call and no citation. */
export const NO_MATCH_STREAM: readonly ChatEvent[] = [
  {
    type: 'route',
    intent: 'structured',
    filters: { towns: ['Westhill'], maxPrice: 50_000, propertyKinds: ['residential'] },
    standaloneQuestion: 'Homes for sale in Westhill under £50,000',
    fallback: null,
  },
  { type: 'retrieval', kind: 'none', reason: 'no_match' },
  {
    type: 'token',
    text: 'No listings in this data match everything you asked for: in Westhill, up to £50,000. Loosening one of these may find some.',
  },
  { type: 'citations', kind: 'properties', ids: [] },
  { type: 'done' },
];

/**
 * A properties stream whose text holds `[P-999999]`, a marker the final
 * citations leave out. The server's guard never streams one, so this is built
 * by hand to prove the page would not link it if one ever got through.
 */
export const STRIPPED_ID_STREAM: readonly ChatEvent[] = PROPERTIES_STREAM.map((event) =>
  event.type === 'token' && event.text.startsWith('is £130,000')
    ? { ...event, text: `${event.text.trimEnd()} And one more [P-999999]. ` }
    : event,
);
