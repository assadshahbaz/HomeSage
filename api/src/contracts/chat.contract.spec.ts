import { CHAT_PROPERTIES_MAX, chatEventSchema, chatRequestSchema } from './chat.contract.js';

const SESSION_ID = '2f1c9a4e-8b7d-4c3a-9e6f-1a2b3c4d5e6f';
const AGGREGATE_SQL =
  "SELECT COUNT(*) AS listings FROM properties p WHERE p.town = 'Stonehaven' LIMIT 50";

const PROPERTY = {
  id: '3501',
  address: '20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK',
  price: 229_000,
  bedrooms: 3,
  bathrooms: 2,
  publicRooms: 1,
  areaM2: 97,
  town: 'Aberdeen',
  postcodeDistrict: 'AB21',
  councilTaxBand: 'E',
  heatingType: 'gas',
  hasGarden: true,
  hasGarage: false,
  hasDoubleGarage: false,
  hasOffStreetParking: true,
  hasLand: false,
  hasGroundFloorBedroomBathroom: false,
  hasGrannyFlat: false,
  hasGreenEnergy: false,
  hasElectricVehicleChargePoint: false,
  isNewBuild: false,
};

const parses = (event: unknown): boolean => chatEventSchema.safeParse(event).success;

describe('chatRequestSchema', () => {
  it('accepts a question and a UUID session id, trimming the question', () => {
    expect(
      chatRequestSchema.parse({ question: ' 3 bed flats in AB15 ', sessionId: SESSION_ID }),
    ).toEqual({ question: '3 bed flats in AB15', sessionId: SESSION_ID });
  });

  it.each([
    ['a missing session id', { question: 'flats in Ellon' }],
    ['a session id that is not a UUID', { question: 'flats in Ellon', sessionId: 'session-1' }],
    ['an empty question', { question: '  ', sessionId: SESSION_ID }],
    ['an extra key', { question: 'flats in Ellon', sessionId: SESSION_ID, filters: {} }],
  ])('rejects %s', (_label, body) => {
    expect(chatRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('chatEventSchema', () => {
  describe('route', () => {
    it('parses the intent, the applied filters with their defaults and the standalone question', () => {
      const event = chatEventSchema.parse({
        type: 'route',
        intent: 'hybrid',
        filters: { maxPrice: 250_000, postcodeDistricts: ['ab15'] },
        standaloneQuestion: '2 bed flats in AB15 under £250k',
        fallback: null,
      });

      expect(event).toEqual({
        type: 'route',
        intent: 'hybrid',
        filters: { maxPrice: 250_000, postcodeDistricts: ['AB15'], propertyKinds: ['residential'] },
        standaloneQuestion: '2 bed flats in AB15 under £250k',
        fallback: null,
      });
    });

    it('rejects an unknown intent', () => {
      expect(
        parses({
          type: 'route',
          intent: 'chitchat',
          filters: {},
          standaloneQuestion: 'hello',
          fallback: null,
        }),
      ).toBe(false);
    });

    it.each(['timeout', 'provider_error', 'parse_failure', 'schema_failure'])(
      'carries a %s fallback',
      (fallback) => {
        expect(
          parses({
            type: 'route',
            intent: 'hybrid',
            filters: {},
            standaloneQuestion: 'cosy flat',
            fallback,
          }),
        ).toBe(true);
      },
    );

    it.each([
      ['an unknown fallback reason', 'gave_up'],
      ['a missing fallback', undefined],
    ])('rejects %s', (_, fallback) => {
      expect(
        parses({
          type: 'route',
          intent: 'hybrid',
          filters: {},
          standaloneQuestion: 'cosy flat',
          fallback,
        }),
      ).toBe(false);
    });
  });

  describe('retrieval', () => {
    it.each([
      ['fused properties', { kind: 'properties', properties: [PROPERTY], ranking: 'fused' }],
      [
        'properties in SQL order',
        { kind: 'properties', properties: [PROPERTY], ranking: 'sql_order' },
      ],
      [
        'an aggregate',
        { kind: 'aggregate', sql: AGGREGATE_SQL, values: [{ listings: 53 }], listingCount: 53 },
      ],
      ['nothing matched', { kind: 'none', reason: 'no_match' }],
      ['a search that failed with nothing back', { kind: 'none', reason: 'search_failed' }],
    ])('parses %s', (_label, payload) => {
      expect(parses({ type: 'retrieval', ...payload })).toBe(true);
    });

    it.each([
      [
        'an empty properties list, which is none instead',
        { kind: 'properties', properties: [], ranking: 'fused' },
      ],
      ['properties with no ranking', { kind: 'properties', properties: [PROPERTY] }],
      ['an unknown ranking', { kind: 'properties', properties: [PROPERTY], ranking: 'aggregate' }],
      [
        `more than ${CHAT_PROPERTIES_MAX} properties`,
        {
          kind: 'properties',
          properties: Array.from({ length: CHAT_PROPERTIES_MAX + 1 }, (_, index) => ({
            ...PROPERTY,
            id: String(index + 1),
          })),
          ranking: 'fused',
        },
      ],
      [
        'a property that is not a valid summary',
        { kind: 'properties', properties: [{ ...PROPERTY, address: '' }], ranking: 'fused' },
      ],
      ['an aggregate with no listing count', { kind: 'aggregate', sql: AGGREGATE_SQL, values: [] }],
      ['an unknown kind', { kind: 'both' }],
      ['none with no reason', { kind: 'none' }],
      ['none with an unknown reason', { kind: 'none', reason: 'empty' }],
    ])('rejects %s', (_label, payload) => {
      expect(parses({ type: 'retrieval', ...payload })).toBe(false);
    });
  });

  describe('token', () => {
    it('parses a piece of text with a citation marker', () => {
      expect(parses({ type: 'token', text: 'a garden and parking [P-3501]' })).toBe(true);
    });

    it('rejects an empty token', () => {
      expect(parses({ type: 'token', text: '' })).toBe(false);
    });
  });

  describe('citations', () => {
    it.each([
      ['properties in citation order', { kind: 'properties', ids: ['50', '3501'] }],
      ['no properties, as after an out of scope decline', { kind: 'properties', ids: [] }],
      ['an aggregate query', { kind: 'aggregate', sql: AGGREGATE_SQL, listingCount: 53 }],
    ])('parses %s', (_label, payload) => {
      expect(parses({ type: 'citations', ...payload })).toBe(true);
    });

    it.each([
      ['an id in citation form rather than digits', { kind: 'properties', ids: ['P-3501'] }],
      ['an id cited twice', { kind: 'properties', ids: ['3501', '3501'] }],
      ['an aggregate with no listing count', { kind: 'aggregate', sql: AGGREGATE_SQL }],
      ['an aggregate with no query', { kind: 'aggregate', sql: '', listingCount: 53 }],
    ])('rejects %s', (_label, payload) => {
      expect(parses({ type: 'citations', ...payload })).toBe(false);
    });
  });

  describe('done and error', () => {
    it('parses both', () => {
      expect(parses({ type: 'done' })).toBe(true);
      expect(parses({ type: 'error', message: 'Search is unavailable. Please try again.' })).toBe(
        true,
      );
    });

    it('rejects an error with no message to show', () => {
      expect(parses({ type: 'error', message: '' })).toBe(false);
    });
  });

  it('rejects an unknown event type', () => {
    expect(parses({ type: 'confidence', value: 0.9 })).toBe(false);
  });
});
