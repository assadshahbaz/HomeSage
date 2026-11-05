import * as z from 'zod';

/**
 * The four answers every seller questionnaire column holds. `unknown` means the
 * seller did not answer, which is never a no.
 */
export const DISCLOSURE_ANSWER = {
  YES: 'yes',
  NO: 'no',
  UNKNOWN: 'unknown',
  NOT_APPLICABLE: 'not_applicable',
} as const;

/** The heating buckets the import sorts the seller's wording into. */
export const HEATING_TYPE = {
  GAS: 'gas',
  OIL: 'oil',
  ELECTRIC: 'electric',
  NONE: 'none',
  OTHER: 'other',
} as const;

/** What a listing is, guessed from words in its address. Never state it as a fact. */
export const PROPERTY_KIND = {
  RESIDENTIAL: 'residential',
  PLOT: 'plot',
  COMMERCIAL: 'commercial',
  OTHER: 'other',
} as const;

export const disclosureAnswerSchema = z.enum(DISCLOSURE_ANSWER);
export const heatingTypeSchema = z.enum(HEATING_TYPE);
export const propertyKindSchema = z.enum(PROPERTY_KIND);

export type DisclosureAnswer = z.infer<typeof disclosureAnswerSchema>;
export type HeatingType = z.infer<typeof heatingTypeSchema>;
export type PropertyKind = z.infer<typeof propertyKindSchema>;

/** Council tax bands in Scotland, lowest to highest. */
export const COUNCIL_TAX_BANDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export const councilTaxBandSchema = z.enum(COUNCIL_TAX_BANDS);

export type CouncilTaxBand = z.infer<typeof councilTaxBandSchema>;

/** A listing's MySQL id as digits, cited in answers as `[P-<id>]`. */
export const propertyIdSchema = z.string().regex(/^\d+$/);

const count = z.number().int().nonnegative().nullable();

/**
 * What a property card shows about one listing, read from its MySQL row. A
 * feature flag of `false` means the listing did not state it, never that the
 * property lacks it. `property_kind` is left out on purpose: it is a guess from
 * the address and never a fact to show.
 */
export const propertySummarySchema = z.strictObject({
  id: propertyIdSchema,
  address: z.string().min(1),
  price: z.number().int().nonnegative(),
  bedrooms: count,
  bathrooms: count,
  publicRooms: count,
  areaM2: count,
  town: z.string().nullable(),
  postcodeDistrict: z.string().nullable(),
  councilTaxBand: councilTaxBandSchema.nullable(),
  /** From the seller's questionnaire, which reports heating far better than the listing flag. */
  heatingType: heatingTypeSchema.nullable(),
  hasGarden: z.boolean(),
  hasGarage: z.boolean(),
  hasDoubleGarage: z.boolean(),
  hasOffStreetParking: z.boolean(),
  hasLand: z.boolean(),
  hasGroundFloorBedroomBathroom: z.boolean(),
  hasGrannyFlat: z.boolean(),
  hasGreenEnergy: z.boolean(),
  hasElectricVehicleChargePoint: z.boolean(),
  isNewBuild: z.boolean(),
});

export type PropertySummary = z.infer<typeof propertySummarySchema>;
