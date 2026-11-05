import type { PropertySummary } from '../../../contracts/index.js';
import { DISCLOSURE_PHRASES } from '../../ingestion/document/disclosure-phrases.js';
import type { DisclosureRow } from '../../ingestion/document/property-row.js';
import { sellerSentence } from '../../ingestion/document/seller-text.js';
import type {
  HybridRetrieval,
  RetrievedProperty,
} from '../../retrieval/hybrid-retrieval.service.js';

/** The marker a property is cited by, which is also how the context names it. */
export function citationMarkerId(id: string): string {
  return `P-${id}`;
}

// Listing flags only ever say a feature is there, so only true ones are written.
const FEATURES: readonly (readonly [keyof PropertySummary, string])[] = [
  ['hasGarden', 'garden'],
  ['hasGarage', 'garage'],
  ['hasDoubleGarage', 'double garage'],
  ['hasOffStreetParking', 'off street parking'],
  ['hasLand', 'land'],
  ['hasGroundFloorBedroomBathroom', 'ground floor bedroom and bathroom'],
  ['hasGrannyFlat', 'granny flat'],
  ['hasGreenEnergy', 'green energy'],
  ['hasElectricVehicleChargePoint', 'electric vehicle charge point'],
  ['isNewBuild', 'new build'],
];

const SELLER_TOPICS: readonly (readonly [keyof DisclosureRow, keyof DisclosureRow, string])[] = [
  ['central_heating', 'central_heating_detail', 'Central heating'],
  ...DISCLOSURE_PHRASES.map(
    ({ column, label }) => [column, `${column}_detail` as keyof DisclosureRow, label] as const,
  ),
];

/** One thing the seller said, as the context carries it. */
interface SellerAnswer {
  readonly topic: string;
  readonly answer?: 'yes' | 'no';
  readonly seller_text?: string;
}

/**
 * The retrieved data the answer model may use, as compact JSON: one object per
 * property, named by its citation marker, or the one aggregate result. Facts
 * the data does not hold are left out rather than written as null, a false
 * flag is never written, and what sellers said is kept apart under
 * `seller_answers` so the prompt can treat it as the seller's words.
 */
export function renderAnswerContext(retrieval: HybridRetrieval): string {
  const { sql } = retrieval;
  if (sql?.aggregate) {
    return JSON.stringify({
      aggregate: {
        values: sql.aggregate.values,
        listing_count: sql.aggregate.listingCount,
        sql: sql.query,
      },
    });
  }
  return JSON.stringify({ properties: retrieval.properties.map(propertyContext) });
}

function propertyContext({ property, disclosure }: RetrievedProperty): Record<string, unknown> {
  const features = FEATURES.flatMap(([flag, name]) => (property[flag] === true ? [name] : []));
  const sellerAnswers = disclosure === null ? [] : sellerAnswersOf(disclosure);
  return withoutEmpty({
    id: citationMarkerId(property.id),
    address: property.address,
    price_gbp: property.price,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    public_rooms: property.publicRooms,
    area_m2: property.areaM2,
    town: property.town,
    postcode_district: property.postcodeDistrict,
    council_tax_band: property.councilTaxBand,
    heating: property.heatingType,
    features,
    parking: disclosure === null ? null : sellerSentence(disclosure.parking_arrangements),
    seller_answers: sellerAnswers,
  });
}

function sellerAnswersOf(disclosure: DisclosureRow): SellerAnswer[] {
  return SELLER_TOPICS.flatMap(([column, detailColumn, topic]): SellerAnswer[] => {
    const value = disclosure[column];
    const answer = value === 'yes' || value === 'no' ? value : undefined;
    const detail = disclosure[detailColumn];
    const text = typeof detail === 'string' ? sellerSentence(detail) : null;
    if (answer === undefined && text === null) {
      return [];
    }
    return [
      {
        topic,
        ...(answer === undefined ? {} : { answer }),
        ...(text === null ? {} : { seller_text: text }),
      },
    ];
  });
}

// An unknown is left out rather than sent as null, so the model never reads one as a no.
function withoutEmpty(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([, value]) => value !== null && !(Array.isArray(value) && value.length === 0),
    ),
  );
}
