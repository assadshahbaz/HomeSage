/**
 * Cleaning rules for the columns read from a listing's address and its tax band.
 * Anything unclear becomes null rather than a guess.
 */

import type { PropertyKind } from '../../src/contracts/index.ts';
import { cleanText } from './source-text.ts';

/** The inward half of a UK postcode, always three characters. */
const INWARD_CODE_LENGTH = 3;
const COUNCIL_TAX_BANDS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

/** Council tax band, or null for the `NA`, `none` and `TBC` placeholders. */
export function councilTaxBand(value: string | null): string | null {
  const band = cleanText(value).toUpperCase();
  return COUNCIL_TAX_BANDS.has(band) ? band : null;
}

export function postcode(value: string | null): string | null {
  const text = cleanText(value).toUpperCase();
  return /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/.test(text) ? text : null;
}

/** Outward code, for example AB15, used for area filters. */
export function postcodeDistrict(value: string | null): string | null {
  const full = postcode(value);
  if (!full) {
    return null;
  }
  return full.includes(' ') ? full.split(' ')[0] : full.slice(0, full.length - INWARD_CODE_LENGTH);
}

/**
 * Towns an address may name. Matching against a known list beats
 * splitting on commas, because many addresses put the street and the town in
 * the same part ("Brackenhurst Road Inverurie").
 */
const KNOWN_TOWNS = [
  'Aberdeen',
  'Aboyne',
  'Alford',
  'Ballater',
  'Balmedie',
  'Banchory',
  'Banff',
  'Brechin',
  'Bucksburn',
  'Cove Bay',
  'Cults',
  'Dyce',
  'Ellon',
  'Fraserburgh',
  'Huntly',
  'Insch',
  'Inverurie',
  'Keith',
  'Kemnay',
  'Kintore',
  'Laurencekirk',
  'Macduff',
  'Milltimber',
  'Montrose',
  'Newmachar',
  'Oldmeldrum',
  'Peterculter',
  'Peterhead',
  'Portlethen',
  'Stonehaven',
  'Strathdon',
  'Turriff',
  'Westhill',
] as const;

/** Last known town named in the address, or null when none is recognised. */
export function townFromAddress(address: string): string | null {
  const text = cleanText(address).toLowerCase();
  let found: string | null = null;
  let foundAt = -1;

  for (const town of KNOWN_TOWNS) {
    const at = text.lastIndexOf(town.toLowerCase());
    if (at > foundAt) {
      found = town;
      foundAt = at;
    }
  }

  return found;
}

const PLOT_PATTERN = /\b(plot|site of|site at|land at|development site|steading)\b/i;
const COMMERCIAL_PATTERN =
  /\b(commercial|premises|shop|retail|office|unit \d|public house|hotel)\b/i;

/**
 * What the listing actually is. The data mixes homes with building plots,
 * commercial units and the odd lodge, and questions about "homes" should
 * not return a field.
 */
export function propertyKind(address: string, bedrooms: number | null): PropertyKind {
  const text = cleanText(address);
  if (COMMERCIAL_PATTERN.test(text)) {
    return 'commercial';
  }
  if (PLOT_PATTERN.test(text)) {
    return 'plot';
  }
  if (bedrooms === null) {
    return 'other';
  }
  return 'residential';
}
