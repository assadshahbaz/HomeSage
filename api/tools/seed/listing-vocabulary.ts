/**
 * Word lists for the made up listings. Every street is invented, and postcodes
 * pair a real district with an inward code that cannot exist, so nothing here
 * can describe a real home.
 */

/** Weighted so every town has enough rows to ask about. */
export const TOWNS = [
  {
    name: 'Aberdeen',
    weight: 40,
    districts: ['AB10', 'AB11', 'AB15', 'AB24', 'AB25'],
    floor: 40_000,
  },
  { name: 'Inverurie', weight: 8, districts: ['AB51'], floor: 70_000 },
  { name: 'Peterhead', weight: 7, districts: ['AB42'], floor: 40_000 },
  { name: 'Ellon', weight: 7, districts: ['AB41'], floor: 70_000 },
  { name: 'Banchory', weight: 7, districts: ['AB31'], floor: 90_000 },
  { name: 'Stonehaven', weight: 7, districts: ['AB39'], floor: 90_000 },
  { name: 'Westhill', weight: 6, districts: ['AB32'], floor: 90_000 },
  { name: 'Fraserburgh', weight: 3, districts: ['AB43'], floor: 40_000 },
  { name: 'Turriff', weight: 3, districts: ['AB53'], floor: 50_000 },
  { name: 'Huntly', weight: 3, districts: ['AB54'], floor: 50_000 },
  { name: 'Portlethen', weight: 3, districts: ['AB12'], floor: 70_000 },
  { name: 'Alford', weight: 2, districts: ['AB33'], floor: 70_000 },
  { name: 'Aboyne', weight: 2, districts: ['AB34'], floor: 90_000 },
  { name: 'Laurencekirk', weight: 2, districts: ['AB30'], floor: 70_000 },
] as const;

export const STREET_NAMES = [
  'Fernlea',
  'Larkfield',
  'Brackenhurst',
  'Thornbury',
  'Wrenfield',
  'Ashlar',
  'Quillan',
  'Merrow',
  'Tolland',
  'Pennant',
  'Selwick',
  'Ospreyfield',
  'Sablewood',
  'Cairnlea',
  'Oakhanger',
  'Lindenhurst',
  'Glenfarrow',
  'Kestrelhill',
  'Harrowmere',
  'Bellweather',
  'Dunmarrow',
  'Elmsgarth',
  'Foxcombe',
  'Gorsewick',
  'Hazelmoor',
  'Juniperhall',
  'Kinlarrow',
  'Lochmarrow',
  'Marlowfield',
  'Netherwick',
  'Orchardleigh',
  'Pinefold',
  'Rowanlea',
  'Sandpiperhill',
  'Tarnbrook',
  'Ullapark',
  'Westerlea',
  'Yarrowfield',
] as const;

export const STREET_TYPES = [
  'Road',
  'Street',
  'Avenue',
  'Drive',
  'Place',
  'Terrace',
  'Crescent',
  'Gardens',
  'Lane',
  'Court',
] as const;

export const FLAT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

/** Letters no real inward code uses, so a postcode built from them cannot exist. */
export const IMPOSSIBLE_INWARD_LETTERS = ['C', 'I', 'K', 'M', 'O', 'V'] as const;

export const COUNCIL_TAX_VALUES = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'none',
  'TBC',
  'NA',
] as const;

export const BEDROOM_WEIGHTS = [
  { value: 1, weight: 15 },
  { value: 2, weight: 35 },
  { value: 3, weight: 25 },
  { value: 4, weight: 16 },
  { value: 5, weight: 7 },
  { value: 6, weight: 2 },
] as const;

// Messy on purpose: the cleaning code has to turn all of these into one answer.
export const YES_ANSWERS = ['Yes', 'YES', 'yes', 'Yes.'] as const;
export const NO_ANSWERS = ['No', 'NO', 'no', 'No.'] as const;
export const UNKNOWN_ANSWERS = ["Don't know", 'Dont Know', 'Not sure', 'unknown', ''] as const;

export const HEATING_ANSWERS = [
  { text: 'Gas', weight: 40 },
  { text: 'gas fired boiler', weight: 12 },
  { text: 'GCH', weight: 8 },
  { text: 'Oil', weight: 12 },
  { text: 'Kerosene range', weight: 3 },
  { text: 'Electric', weight: 10 },
  { text: 'Storage heaters', weight: 6 },
  { text: 'Ground source pump feeding underfloor loops', weight: 3 },
  { text: 'Wood burner only', weight: 2 },
] as const;

export const PARKING_ANSWERS = [
  'Own driveway with room for one car',
  'Shared courtyard behind the building',
  'Permit bays along the kerb',
  'Block paved drive and an integral garage',
  'Numbered bay in the residents car park',
  'Free roadside spaces outside the door',
  'Double width tarmac drive leading to the garage',
] as const;

export const SUPPLIERS = {
  gas_supplier: ['Example Energy', 'Sample Gas Co'],
  electricity_supplier: ['Example Energy', 'Sample Power Co'],
  water_supplier: ['Example Water'],
  broadband_supplier: ['Example Broadband', 'Sample Fibre Co'],
  heating_supplier: ['Example Energy'],
  cable_tv_supplier: ['Example Television'],
} as const;

/** A sentence a seller might write, keyed by the questionnaire column it answers. */
export const SELLER_DETAILS: ReadonlyMap<string, readonly string[]> = new Map(
  Object.entries({
    windows_replaced: [
      'Yes, front bay units swapped for triple glazing during 2019',
      'Yes, timber sashes refitted by the previous owner in 2016',
    ],
    structural_damage: [
      'Yes, gable wall repointed after gale damage last winter',
      'Yes, kitchen ceiling patched following an overflowing tank upstairs',
    ],
    asbestos_presence: [
      'Yes, cement sheet cladding on the old coal bunker',
      'Yes, textured coating in the hall tested positive and sealed',
    ],
    major_roof_repairs: [
      'Yes, ridge tiles rebedded and valley lead renewed in 2021',
      'Yes, whole slate roof stripped and relaid three summers ago',
    ],
    specialist_work: [
      'Yes, cellar tanked by a contractor with a transferable warranty',
      'Yes, joists treated for woodworm when the floors were lifted',
    ],
    other_regular_charges: [
      'Yes, factor invoice of £85 each quarter for the stairwell',
      'Yes, £120 yearly towards upkeep of the private access road',
    ],
    received_notices: ['Yes, letter about an extension proposed two doors along'],
    public_right_of_way: [
      'Yes, walkers may cross the bottom of the paddock',
      'Yes, bin lorry access runs along the side lane',
    ],
    conservation_area_status: ['Yes, part of the old harbour heritage zone'],
  }),
);
