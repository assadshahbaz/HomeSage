import { PropertyDocumentBuilder } from '../document/property-document-builder.js';
import { propertyIndexMapping } from './property-index-mapping.js';

const DIMENSIONS = 1536;
const PROPERTY_ID = 1234;

describe('propertyIndexMapping', () => {
  const mapping = propertyIndexMapping(DIMENSIONS);

  it('maps exactly the fields a built document carries, plus the vector', () => {
    const document = new PropertyDocumentBuilder().build(
      {
        id: PROPERTY_ID,
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
        has_garage: true,
        has_double_garage: false,
        has_garden: true,
        has_land: false,
        has_central_heating: false,
        is_parking_available: true,
        has_on_street_parking: false,
        has_off_street_parking: true,
        has_ground_floor_bedroom_bathroom: false,
        has_granny_flat: false,
        has_green_energy: false,
        has_electric_vehicle_charge_point: false,
        is_self_contained: false,
        is_new_build: false,
        is_development: false,
        is_development_opportunity: false,
        updated_at: new Date('2026-09-20T09:15:00.000Z'),
      },
      null,
    );
    expect(Object.keys(mapping.properties ?? {}).sort()).toEqual(
      [...Object.keys(document), 'embedding'].sort(),
    );
  });

  it('refuses fields it does not map', () => {
    expect(mapping.dynamic).toBe('strict');
  });

  it('takes the vector size from its argument, with cosine similarity over plain HNSW', () => {
    expect(propertyIndexMapping(768).properties?.['embedding']).toEqual({
      type: 'dense_vector',
      dims: 768,
      index: true,
      similarity: 'cosine',
      index_options: { type: 'hnsw' },
    });
  });

  it('keeps the standard analyzer on the text, so "no" and "not" stay searchable', () => {
    expect(mapping.properties?.['text']).toEqual({ type: 'text' });
  });

  it.each([
    ['price', 'integer'],
    ['bedrooms', 'integer'],
    ['bathrooms', 'integer'],
    ['public_rooms', 'integer'],
    ['area_m2', 'integer'],
    ['id', 'keyword'],
    ['post_code', 'keyword'],
    ['postcode_district', 'keyword'],
    ['town', 'keyword'],
    ['council_tax_band', 'keyword'],
    ['property_kind', 'keyword'],
    ['heating_type', 'keyword'],
    ['has_garden', 'boolean'],
    ['has_garage', 'boolean'],
    ['has_off_street_parking', 'boolean'],
    ['is_new_build', 'boolean'],
    ['updated_at', 'date'],
  ])('maps %s as %s', (field, type) => {
    expect(mapping.properties?.[field]).toEqual({ type });
  });
});
