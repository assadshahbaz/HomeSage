import { z } from 'zod';
import { heatingTypeSchema, propertyKindSchema } from '../../../contracts/index.js';
import type { SearchResult } from '../../../contracts/index.js';

/** The stored fields a result card needs. Never `embedding`: vectors do not leave the API. */
export const RESULT_SOURCE_FIELDS = [
  'id',
  'text',
  'price',
  'bedrooms',
  'bathrooms',
  'public_rooms',
  'area_m2',
  'post_code',
  'postcode_district',
  'town',
  'council_tax_band',
  'property_kind',
  'heating_type',
  'has_garden',
  'has_garage',
  'has_off_street_parking',
  'is_new_build',
] as const;

const hitSchema = z.object({
  _score: z.number(),
  _source: z.object({
    id: z.string(),
    text: z.string(),
    price: z.number(),
    bedrooms: z.number().nullable(),
    bathrooms: z.number().nullable(),
    public_rooms: z.number().nullable(),
    area_m2: z.number().nullable(),
    post_code: z.string().nullable(),
    postcode_district: z.string().nullable(),
    town: z.string().nullable(),
    council_tax_band: z.string().nullable(),
    property_kind: propertyKindSchema,
    heating_type: heatingTypeSchema.nullable(),
    has_garden: z.boolean(),
    has_garage: z.boolean(),
    has_off_street_parking: z.boolean(),
    is_new_build: z.boolean(),
  }),
});

/**
 * One Elasticsearch hit as a result card, parsed at the boundary. A hit of any
 * other shape throws here rather than reaching a caller half typed.
 */
export function toSearchResult(hit: unknown): SearchResult {
  const { _score: score, _source: source } = hitSchema.parse(hit);
  return {
    id: source.id,
    score,
    price: source.price,
    bedrooms: source.bedrooms,
    bathrooms: source.bathrooms,
    publicRooms: source.public_rooms,
    areaM2: source.area_m2,
    town: source.town,
    postcodeDistrict: source.postcode_district,
    postCode: source.post_code,
    councilTaxBand: source.council_tax_band,
    propertyKind: source.property_kind,
    heatingType: source.heating_type,
    hasGarden: source.has_garden,
    hasGarage: source.has_garage,
    hasOffStreetParking: source.has_off_street_parking,
    isNewBuild: source.is_new_build,
    text: source.text,
  };
}
