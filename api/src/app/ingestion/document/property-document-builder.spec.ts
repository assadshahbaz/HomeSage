import { DISCLOSURE_PHRASES } from './disclosure-phrases.js';
import { PropertyDocumentBuilder } from './property-document-builder.js';
import type { DisclosureRow, PropertyRow } from './property-row.js';
import { FORBIDDEN_WORD } from './seller-text.js';

const HOUSE_ID = 1234;
const FLAT_ID = 2871;
const PLOT_ID = 3120;
const NO_AREA_ID = 4012;
const DETAILED_ID = 1877;
const UPDATED_AT = new Date('2026-09-20T09:15:00.000Z');

const FLAGS_OFF = {
  has_garage: false,
  has_double_garage: false,
  has_garden: false,
  has_land: false,
  has_central_heating: false,
  is_parking_available: false,
  has_on_street_parking: false,
  has_off_street_parking: false,
  has_ground_floor_bedroom_bathroom: false,
  has_granny_flat: false,
  has_green_energy: false,
  has_electric_vehicle_charge_point: false,
  is_self_contained: false,
  is_new_build: false,
  is_development: false,
  is_development_opportunity: false,
} as const;

function property(overrides: Partial<PropertyRow>): PropertyRow {
  return {
    id: HOUSE_ID,
    full_address: '20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK',
    post_code: 'AB21 9CK',
    postcode_district: 'AB21',
    town: 'Aberdeen',
    price: 229000,
    area_m2: 97,
    council_tax_band: 'E',
    bedrooms: 3,
    bathrooms: 2,
    public_rooms: 2,
    property_kind: 'residential',
    ...FLAGS_OFF,
    updated_at: UPDATED_AT,
    ...overrides,
  };
}

// Every answer unknown and every text empty, as for a questionnaire that said nothing.
function disclosure(overrides: Partial<DisclosureRow>): DisclosureRow {
  const blank = Object.fromEntries(
    DISCLOSURE_PHRASES.flatMap(({ column }) => [
      [column, 'unknown'],
      [`${column}_detail`, null],
    ]),
  );
  return {
    ...blank,
    property_id: HOUSE_ID,
    heating_type: null,
    parking_arrangements: null,
    central_heating: 'unknown',
    central_heating_detail: null,
    ...overrides,
  } as DisclosureRow;
}

const builder = new PropertyDocumentBuilder();

const HOUSE = property({
  has_garden: true,
  has_garage: true,
  has_off_street_parking: true,
  is_parking_available: true,
});
const HOUSE_DISCLOSURE = disclosure({
  heating_type: 'gas',
  central_heating: 'yes',
  parking_arrangements: 'in the driveway',
  windows_replaced: 'yes',
  windows_replaced_detail: 'Yes, every window changed to double glazing around 2010',
  listed_building: 'no',
  structural_damage: 'no',
  major_roof_repairs: 'no',
  mains_drainage: 'yes',
});

const FLAT = property({
  id: FLAT_ID,
  full_address: 'Flat 3, 14 Fernlea Grove, Aberdeen, AB10 6CK',
  post_code: 'AB10 6CK',
  postcode_district: 'AB10',
  price: 145000,
  area_m2: 68,
  council_tax_band: 'C',
  bedrooms: 2,
  bathrooms: 1,
  public_rooms: 1,
  has_on_street_parking: true,
  is_parking_available: true,
  has_central_heating: true,
});

const PLOT = property({
  id: PLOT_ID,
  full_address: 'Plot 4, Site Of Former Mill, Banchory, AB31 5CK',
  post_code: 'AB31 5CK',
  postcode_district: 'AB31',
  town: 'Banchory',
  price: 85000,
  area_m2: null,
  council_tax_band: null,
  bedrooms: null,
  bathrooms: null,
  public_rooms: null,
  property_kind: 'plot',
  has_land: true,
  is_development_opportunity: true,
});

const NO_AREA = property({
  id: NO_AREA_ID,
  full_address: '12 Tolland Street, Turriff, AB53 4CK',
  post_code: 'AB53 4CK',
  postcode_district: 'AB53',
  town: 'Turriff',
  price: 110000,
  area_m2: 0,
  council_tax_band: null,
  bedrooms: 2,
  bathrooms: 1,
  public_rooms: 1,
  has_garden: true,
});

const DETAILED = property({
  id: DETAILED_ID,
  full_address: '7 Oakhanger Drive, Oakhanger, Stonehaven, AB39 8CK',
  post_code: 'AB39 8CK',
  postcode_district: 'AB39',
  town: 'Stonehaven',
  price: 325000,
  area_m2: 131,
  council_tax_band: 'F',
  bedrooms: 4,
  bathrooms: 3,
  public_rooms: 2,
  has_garden: true,
  has_double_garage: true,
  has_garage: true,
  has_off_street_parking: true,
  is_parking_available: true,
  has_green_energy: true,
  is_new_build: true,
});
const DETAILED_DISCLOSURE = disclosure({
  property_id: DETAILED_ID,
  heating_type: 'electric',
  central_heating: 'yes',
  central_heating_detail: 'Ground source heat pump feeding radiators.',
  parking_arrangements: 'Garage,   Driveway',
  windows_replaced: 'unknown',
  windows_replaced_detail: 'UPVC units fitted',
  structural_damage: 'yes',
  structural_damage_detail: 'Yes, ceiling stained by a leaking cistern',
  major_roof_repairs: 'yes',
  major_roof_repairs_detail: 'Yes, date unknown',
  specialist_work: 'yes',
  specialist_work_detail: 'Yes',
  other_regular_charges: 'yes',
  other_regular_charges_detail: 'Yes, annual fee £165 to Oakhanger Residents Company',
  received_notices: 'yes',
  received_notices_detail: 'a letter saying the house next door plans a side extension',
  public_right_of_way: 'yes',
  public_right_of_way_detail: 'Yes, shared driveway',
});

describe('PropertyDocumentBuilder golden strings', () => {
  it('writes a full residential row with its questionnaire', () => {
    expect(builder.build(HOUSE, HOUSE_DISCLOSURE)).toEqual({
      id: '1234',
      text:
        '3 bedroom, 2 bathroom property with 2 public rooms at 20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK. ' +
        'Asking price £229,000. Floor area 97 m². Council tax band E. ' +
        'Garden, garage and off street parking. Gas central heating. Parking: In the driveway. ' +
        'Not a listed building. Windows: Yes, every window changed to double glazing around 2010. ' +
        'No structural damage reported. Mains drainage. No major roof repairs reported.',
      price: 229000,
      bedrooms: 3,
      bathrooms: 2,
      public_rooms: 2,
      area_m2: 97,
      post_code: 'AB21 9CK',
      postcode_district: 'AB21',
      town: 'Aberdeen',
      council_tax_band: 'E',
      property_kind: 'residential',
      heating_type: 'gas',
      has_garden: true,
      has_garage: true,
      has_off_street_parking: true,
      is_new_build: false,
      updated_at: '2026-09-20T09:15:00.000Z',
    });
  });

  it('writes a row with no questionnaire from the listing alone', () => {
    const document = builder.build(FLAT, null);
    expect(document.text).toBe(
      '2 bedroom, 1 bathroom property with 1 public room at Flat 3, 14 Fernlea Grove, Aberdeen, AB10 6CK. ' +
        'Asking price £145,000. Floor area 68 m². Council tax band C. ' +
        'On street parking. Central heating.',
    );
    expect(document.heating_type).toBeNull();
  });

  it('writes a plot without calling it a plot beyond its own address', () => {
    const document = builder.build(PLOT, null);
    expect(document.text).toBe(
      'Property at Plot 4, Site Of Former Mill, Banchory, AB31 5CK. Asking price £85,000. ' +
        'Land. Development opportunity.',
    );
    expect(document).toMatchObject({
      property_kind: 'plot',
      bedrooms: null,
      bathrooms: null,
      public_rooms: null,
      area_m2: null,
      council_tax_band: null,
    });
  });

  it('leaves out a zero floor area and a missing council tax band', () => {
    const document = builder.build(NO_AREA, null);
    expect(document.text).toBe(
      '2 bedroom, 1 bathroom property with 1 public room at 12 Tolland Street, Turriff, AB53 4CK. ' +
        'Asking price £110,000. Garden.',
    );
    expect(document.area_m2).toBeNull();
    expect(document.council_tax_band).toBeNull();
  });

  it("writes the seller's own detail where it says more than yes or no", () => {
    expect(builder.build(DETAILED, DETAILED_DISCLOSURE).text).toBe(
      '4 bedroom, 3 bathroom property with 2 public rooms at 7 Oakhanger Drive, Oakhanger, Stonehaven, AB39 8CK. ' +
        'Asking price £325,000. Floor area 131 m². Council tax band F. ' +
        'Garden, double garage, off street parking and green energy. New build. ' +
        'Electric central heating. Heating: Ground source heat pump feeding radiators. ' +
        'Parking: Garage, Driveway. ' +
        'Structural damage: Yes, ceiling stained by a leaking cistern. ' +
        'Major roof repairs reported. ' +
        'Regular charges: Yes, annual fee £165 to Oakhanger Residents Company. ' +
        'Specialist work reported. ' +
        'Notices: A letter saying the house next door plans a side extension. ' +
        'Right of way: Yes, shared driveway.',
    );
  });
});

describe('PropertyDocumentBuilder listing flags', () => {
  const bare = property({});

  it.each([
    ['has_garden', 'Garden.'],
    ['has_double_garage', 'Double garage.'],
    ['has_garage', 'Garage.'],
    ['has_land', 'Land.'],
    ['has_off_street_parking', 'Off street parking.'],
    ['has_on_street_parking', 'On street parking.'],
    ['is_parking_available', 'Parking.'],
    ['has_ground_floor_bedroom_bathroom', 'A ground floor bedroom and bathroom.'],
    ['has_granny_flat', 'A granny flat.'],
    ['has_green_energy', 'Green energy.'],
    ['has_electric_vehicle_charge_point', 'An electric vehicle charge point.'],
    ['is_new_build', 'New build.'],
    ['is_self_contained', 'Self contained.'],
    ['is_development', 'Part of a development.'],
    ['is_development_opportunity', 'Development opportunity.'],
    ['has_central_heating', 'Central heating.'],
  ] as const)('writes %s only when it is set', (flag, sentence) => {
    expect(builder.build(bare, null).text).not.toContain(sentence);
    expect(builder.build(property({ [flag]: true }), null).text).toContain(sentence);
  });

  it('writes nothing negative for a flag that is not set', () => {
    expect(builder.build(bare, null).text).toBe(
      '3 bedroom, 2 bathroom property with 2 public rooms at 20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK. ' +
        'Asking price £229,000. Floor area 97 m². Council tax band E.',
    );
  });

  it('writes a double garage instead of a garage when both are set', () => {
    const text = builder.build(property({ has_garage: true, has_double_garage: true }), null).text;
    expect(text).toContain('Double garage.');
    expect(text).not.toMatch(/garage and|, garage/);
  });

  it('writes plain parking only when neither kind of parking is stated', () => {
    const text = builder.build(
      property({ is_parking_available: true, has_off_street_parking: true }),
      null,
    ).text;
    expect(text).toContain('Off street parking.');
    expect(text).not.toContain(' and parking');
  });

  it('marks a double garage as a garage for the garage filter', () => {
    expect(builder.build(property({ has_double_garage: true }), null).has_garage).toBe(true);
  });
});

describe('PropertyDocumentBuilder seller answers', () => {
  it.each(DISCLOSURE_PHRASES.map((phrase) => [phrase.column, phrase] as const))(
    '%s: writes nothing for unknown or not applicable, and its phrase for yes and no',
    (column, phrase) => {
      const textFor = (answer: string): string =>
        builder.build(HOUSE, disclosure({ [column]: answer })).text;
      const baseline = builder.build(HOUSE, disclosure({})).text;

      expect(textFor('unknown')).toBe(baseline);
      expect(textFor('not_applicable')).toBe(baseline);
      expect(textFor('yes')).toBe(`${baseline} ${phrase.yes}`);
      expect(textFor('no')).toBe(phrase.no === undefined ? baseline : `${baseline} ${phrase.no}`);
    },
  );

  it('drops detail under an unknown answer, since the detail never answers on its own', () => {
    const text = builder.build(
      HOUSE,
      disclosure({ windows_replaced: 'unknown', windows_replaced_detail: 'UPVC units fitted' }),
    ).text;
    expect(text).not.toContain('UPVC');
  });

  it('falls back to the phrase when the detail holds a forbidden word', () => {
    const text = builder.build(
      HOUSE,
      disclosure({ asbestos: 'yes', asbestos_detail: 'Yes, N/A for the garage roof' }),
    ).text;
    expect(text).toContain('Asbestos reported.');
    expect(text).not.toContain('garage roof');
  });

  it('leaves out parking arrangements that are empty or hold a forbidden word', () => {
    expect(builder.build(HOUSE, disclosure({ parking_arrangements: '  ' })).text).not.toContain(
      'Parking:',
    );
    expect(
      builder.build(HOUSE, disclosure({ parking_arrangements: 'unknown' })).text,
    ).not.toContain('Parking:');
  });
});

describe('PropertyDocumentBuilder heating', () => {
  it.each([
    [
      'a type with central heating confirmed',
      { heating_type: 'oil', central_heating: 'yes' },
      false,
      'Oil central heating.',
    ],
    [
      'central heating from the listing flag alone',
      { heating_type: 'oil' },
      true,
      'Oil central heating.',
    ],
    [
      'a type with central heating not confirmed',
      { heating_type: 'electric' },
      false,
      'Electric heating.',
    ],
    [
      'the seller saying there is no central heating',
      { heating_type: 'electric', central_heating: 'no' },
      false,
      'Electric heating. No central heating.',
    ],
    [
      'no heating system',
      { heating_type: 'none', central_heating: 'no' },
      false,
      'No central heating. No heating system reported.',
    ],
    [
      'an other type, which names nothing',
      { heating_type: 'other', central_heating: 'yes' },
      false,
      'Central heating.',
    ],
  ] as const)('writes %s', (_, answers, flag, expected) => {
    const text = builder.build(property({ has_central_heating: flag }), disclosure(answers)).text;
    expect(text.endsWith(`Council tax band E. ${expected}`)).toBe(true);
  });

  it('writes no heating at all when nothing is known', () => {
    expect(builder.build(property({}), disclosure({})).text).not.toMatch(/heating/i);
  });
});

describe('PropertyDocumentBuilder numbers', () => {
  it.each([
    [500, '£500'],
    [160000, '£160,000'],
    [1499000, '£1,499,000'],
  ])('writes a price of %i as %s', (price, written) => {
    expect(builder.build(property({ price }), null).text).toContain(`Asking price ${written}.`);
  });

  it('writes one bedroom and one bathroom in the singular', () => {
    expect(
      builder.build(property({ bedrooms: 1, bathrooms: 1, public_rooms: null }), null).text,
    ).toMatch(/^1 bedroom, 1 bathroom property at /);
  });

  it('writes only the counts it has', () => {
    expect(
      builder.build(property({ bedrooms: 0, bathrooms: 1, public_rooms: 0 }), null).text,
    ).toMatch(/^1 bathroom property at /);
  });
});

describe('PropertyDocumentBuilder output', () => {
  const fixtures: readonly (readonly [PropertyRow, DisclosureRow | null])[] = [
    [HOUSE, HOUSE_DISCLOSURE],
    [FLAT, null],
    [PLOT, null],
    [NO_AREA, null],
    [DETAILED, DETAILED_DISCLOSURE],
  ];

  it('is the same byte for byte when built twice', () => {
    for (const [row, answers] of fixtures) {
      expect(JSON.stringify(builder.build(row, answers))).toBe(
        JSON.stringify(new PropertyDocumentBuilder().build(row, answers)),
      );
    }
  });

  it('never contains a forbidden word, a double space or an empty sentence', () => {
    for (const [row, answers] of fixtures) {
      const { text } = builder.build(row, answers);
      expect(text).not.toMatch(FORBIDDEN_WORD);
      expect(text).not.toMatch(/ {2}|\.\.|^ | $/);
    }
  });
});
