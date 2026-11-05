import { DISCLOSURE_ANSWER, HEATING_TYPE } from '../../../contracts/index.js';
import { DISCLOSURE_PHRASES } from './disclosure-phrases.js';
import type { PropertyDocument } from './property-document.js';
import type { DisclosureRow, PropertyRow } from './property-row.js';
import { sellerSentence } from './seller-text.js';

type Flag = {
  [Column in keyof PropertyRow]: PropertyRow[Column] extends boolean ? Column : never;
}[keyof PropertyRow];

// Listing features, in the order they are listed. Double garage stands in for
// garage, and plain parking only shows when neither parking kind is stated.
const FEATURES: readonly (readonly [Flag, string])[] = [
  ['has_garden', 'garden'],
  ['has_double_garage', 'double garage'],
  ['has_garage', 'garage'],
  ['has_land', 'land'],
  ['has_off_street_parking', 'off street parking'],
  ['has_on_street_parking', 'on street parking'],
  ['is_parking_available', 'parking'],
  ['has_ground_floor_bedroom_bathroom', 'a ground floor bedroom and bathroom'],
  ['has_granny_flat', 'a granny flat'],
  ['has_green_energy', 'green energy'],
  ['has_electric_vehicle_charge_point', 'an electric vehicle charge point'],
];

const STATUS: readonly (readonly [Flag, string])[] = [
  ['is_new_build', 'New build.'],
  ['is_self_contained', 'Self contained.'],
  ['is_development', 'Part of a development.'],
  ['is_development_opportunity', 'Development opportunity.'],
];

// Heating types a sentence can name. `other` says nothing a reader can use.
const HEATING_WORD: Readonly<Partial<Record<string, string>>> = {
  [HEATING_TYPE.GAS]: 'Gas',
  [HEATING_TYPE.OIL]: 'Oil',
  [HEATING_TYPE.ELECTRIC]: 'Electric',
};

/**
 * Turns one property and its seller questionnaire, if it has one, into the
 * paragraph that is embedded and searched, plus the facts search filters on.
 *
 * The data has no listing descriptions, so the paragraph is built only from
 * what the row states. A missing fact is left out rather than written as
 * unknown. A listing flag of 0 means the listing did not mention it, so only
 * set flags are written, and a no is written only where the seller answered
 * no. `property_kind` is a guess from the address and never appears as fact.
 * The output depends on nothing but the input, so the same row always gives
 * the same document.
 */
export class PropertyDocumentBuilder {
  /** The document for one property; `disclosure` is `null` for a listing with no questionnaire. */
  public build(property: PropertyRow, disclosure: DisclosureRow | null): PropertyDocument {
    const sentences = [
      this.introduction(property),
      `Asking price £${groupThousands(property.price)}.`,
      positive(property.area_m2) === null ? null : `Floor area ${String(property.area_m2)} m².`,
      property.council_tax_band === null ? null : `Council tax band ${property.council_tax_band}.`,
      this.features(property),
      ...STATUS.map(([flag, sentence]) => (property[flag] ? sentence : null)),
      ...this.heating(property, disclosure),
      ...(disclosure === null ? [] : this.disclosures(disclosure)),
    ];

    return {
      id: String(property.id),
      text: sentences.filter((sentence) => sentence !== null).join(' '),
      price: property.price,
      bedrooms: positive(property.bedrooms),
      bathrooms: positive(property.bathrooms),
      public_rooms: positive(property.public_rooms),
      area_m2: positive(property.area_m2),
      post_code: property.post_code,
      postcode_district: property.postcode_district,
      town: property.town,
      council_tax_band: property.council_tax_band,
      property_kind: property.property_kind,
      heating_type: disclosure?.heating_type ?? null,
      has_garden: property.has_garden,
      has_garage: property.has_garage || property.has_double_garage,
      has_off_street_parking: property.has_off_street_parking,
      is_new_build: property.is_new_build,
      updated_at: property.updated_at.toISOString(),
    };
  }

  // "3 bedroom, 2 bathroom property with 2 public rooms at <address>." Always
  // "property", because the kind of property is only a guess.
  private introduction(property: PropertyRow): string {
    const bedrooms = positive(property.bedrooms);
    const bathrooms = positive(property.bathrooms);
    const publicRooms = positive(property.public_rooms);
    const sizes = [
      bedrooms === null ? null : `${String(bedrooms)} bedroom`,
      bathrooms === null ? null : `${String(bathrooms)} bathroom`,
    ].filter((size) => size !== null);
    const noun = sizes.length === 0 ? 'Property' : `${sizes.join(', ')} property`;
    const rooms =
      publicRooms === null ? '' : ` with ${plural(publicRooms, 'public room', 'public rooms')}`;
    return `${noun}${rooms} at ${property.full_address}.`;
  }

  private features(property: PropertyRow): string | null {
    const specificParking = property.has_off_street_parking || property.has_on_street_parking;
    const present = FEATURES.filter(([flag]) => {
      if (flag === 'has_garage') {
        return property.has_garage && !property.has_double_garage;
      }
      if (flag === 'is_parking_available') {
        return property.is_parking_available && !specificParking;
      }
      return property[flag];
    }).map(([, phrase]) => phrase);
    if (present.length === 0) {
      return null;
    }
    const list = joinList(present);
    return `${list.charAt(0).toUpperCase()}${list.slice(1)}.`;
  }

  // Central heating is confirmed by the seller's yes or by the listing flag;
  // only the seller's no can deny it.
  private heating(property: PropertyRow, disclosure: DisclosureRow | null): string[] {
    const answer = disclosure?.central_heating;
    const confirmed = answer === DISCLOSURE_ANSWER.YES || property.has_central_heating;
    const type = disclosure?.heating_type ?? null;
    const word = type === null ? undefined : HEATING_WORD[type];
    const sentences: string[] = [];

    if (confirmed) {
      sentences.push(word === undefined ? 'Central heating.' : `${word} central heating.`);
    } else if (word !== undefined) {
      sentences.push(`${word} heating.`);
    }
    if (answer === DISCLOSURE_ANSWER.NO && !property.has_central_heating) {
      sentences.push('No central heating.');
    }
    if (type === HEATING_TYPE.NONE) {
      sentences.push('No heating system reported.');
    }
    if (answer === DISCLOSURE_ANSWER.YES || answer === DISCLOSURE_ANSWER.NO) {
      const detail = sellerSentence(disclosure?.central_heating_detail ?? null);
      if (detail !== null) {
        sentences.push(`Heating: ${detail}`);
      }
    }
    return sentences;
  }

  private disclosures(disclosure: DisclosureRow): string[] {
    const parking = sellerSentence(disclosure.parking_arrangements);
    const answers = DISCLOSURE_PHRASES.map((phrase) => {
      const answer = disclosure[phrase.column];
      if (answer !== DISCLOSURE_ANSWER.YES && answer !== DISCLOSURE_ANSWER.NO) {
        return null;
      }
      const detail = sellerSentence(disclosure[`${phrase.column}_detail`]);
      if (detail !== null) {
        return `${phrase.label}: ${detail}`;
      }
      return answer === DISCLOSURE_ANSWER.YES ? phrase.yes : (phrase.no ?? null);
    });
    return [parking === null ? null : `Parking: ${parking}`, ...answers].filter(
      (sentence) => sentence !== null,
    );
  }
}

// A zero count or area in this data means the listing gave none.
function positive(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

// Written out rather than left to Intl, so the text never depends on the host's locale data.
function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function joinList(items: readonly string[]): string {
  return items.length === 1
    ? items[0]
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
