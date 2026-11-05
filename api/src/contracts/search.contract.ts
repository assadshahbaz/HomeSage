import * as z from 'zod';
import {
  councilTaxBandSchema,
  heatingTypeSchema,
  PROPERTY_KIND,
  propertyKindSchema,
} from './property.contract.js';

// Long enough for any real query, short enough that a pasted document is refused.
const MAX_QUERY_LENGTH = 500;

/** Results returned when the request names no `topK`. */
export const SEARCH_TOP_K_DEFAULT = 8;
/** The most results one search may ask for. */
export const SEARCH_TOP_K_MAX = 20;

const nonNegativeInt = z.number().int().nonnegative();
const name = z.string().trim().min(1);

// A listing flag of 0 means the listing did not state it, never that it lacks
// it, so there is nothing true to filter on for `false`.
const statedFlag = z.literal(true, {
  error: 'Only true can be filtered on: a flag of 0 in this data means not stated, not no',
});

/**
 * Filters applied inside the kNN search, so every result matches them. Each is
 * optional; lists mean any of. Property kinds default to residential, so plots
 * and commercial units appear only when asked for.
 */
export const searchFiltersSchema = z
  .object({
    minPrice: nonNegativeInt.optional(),
    maxPrice: nonNegativeInt.optional(),
    minBedrooms: nonNegativeInt.optional(),
    maxBedrooms: nonNegativeInt.optional(),
    // The data writes districts in capitals, such as AB10.
    postcodeDistricts: z
      .array(name.transform((district) => district.toUpperCase()))
      .min(1)
      .optional(),
    towns: z.array(name).min(1).optional(),
    councilTaxBands: z.array(councilTaxBandSchema).min(1).optional(),
    propertyKinds: z.array(propertyKindSchema).min(1).default([PROPERTY_KIND.RESIDENTIAL]),
    hasGarden: statedFlag.optional(),
    hasGarage: statedFlag.optional(),
    hasOffStreetParking: statedFlag.optional(),
    isNewBuild: statedFlag.optional(),
  })
  .strict()
  .refine((filters) => !isInverted(filters.minPrice, filters.maxPrice), {
    message: 'minPrice is above maxPrice',
    path: ['minPrice'],
  })
  .refine((filters) => !isInverted(filters.minBedrooms, filters.maxBedrooms), {
    message: 'minBedrooms is above maxBedrooms',
    path: ['minBedrooms'],
  });

/** Request body of `POST /search/semantic`. */
export const semanticSearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
    topK: z.number().int().min(1).max(SEARCH_TOP_K_MAX).default(SEARCH_TOP_K_DEFAULT),
    // Parsed even when absent, so its defaults apply.
    filters: searchFiltersSchema.prefault({}),
  })
  .strict();

/** One property a search found, with what a result card shows. Never its vector. */
export const searchResultSchema = z.object({
  id: z.string(),
  /** How close the property is to the query, higher is closer. Comparable within one search only. */
  score: z.number(),
  price: z.number(),
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  publicRooms: z.number().nullable(),
  areaM2: z.number().nullable(),
  town: z.string().nullable(),
  postcodeDistrict: z.string().nullable(),
  postCode: z.string().nullable(),
  councilTaxBand: z.string().nullable(),
  propertyKind: propertyKindSchema,
  heatingType: heatingTypeSchema.nullable(),
  hasGarden: z.boolean(),
  hasGarage: z.boolean(),
  hasOffStreetParking: z.boolean(),
  isNewBuild: z.boolean(),
  /** The paragraph the property was embedded from, which carries its address. */
  text: z.string(),
});

/** Response body of `POST /search/semantic`. */
export const semanticSearchResponseSchema = z.object({
  query: z.string(),
  topK: z.number().int(),
  /** The filters as applied, defaults included. */
  filters: searchFiltersSchema,
  results: z.array(searchResultSchema),
  timing: z.object({
    embedMs: nonNegativeInt,
    searchMs: nonNegativeInt,
    totalMs: nonNegativeInt,
  }),
});

function isInverted(min: number | undefined, max: number | undefined): boolean {
  return min !== undefined && max !== undefined && min > max;
}

export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export type SemanticSearchRequest = z.infer<typeof semanticSearchRequestSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SemanticSearchResponse = z.infer<typeof semanticSearchResponseSchema>;
