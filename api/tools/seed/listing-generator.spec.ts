import { describe, expect, it } from 'vitest';
import { toDisclosureInsert } from './disclosure-mapper.ts';
import { generateListings } from './listing-generator.ts';
import { containsPersonalData } from './personal-data.ts';
import { dedupeByAddress, toPropertyInsert } from './property-mapper.ts';

const generated = generateListings();
const { rows, dropped } = dedupeByAddress(generated.properties.map(toPropertyInsert));

describe('generateListings', () => {
  it('builds the same rows every time', () => {
    expect(generateListings()).toEqual(generated);
  });

  it('gives every listing a postcode that cannot exist', () => {
    for (const row of rows) {
      expect(row.post_code).toMatch(/^[A-Z]{1,2}\d{1,2} \d[CIKMOV]{2}$/);
    }
  });

  it('writes no seller text that looks like a person or a phone number', () => {
    for (const row of generated.questionnaires) {
      const answers = Object.entries(row).filter(([column]) => column !== 'property_id');
      for (const [, value] of answers) {
        expect(containsPersonalData(value)).toBe(false);
      }
    }
  });

  it('survives the cleaning code, repeats included', () => {
    expect(dropped.length).toBeGreaterThan(0);
    expect(generated.questionnaires.map(toDisclosureInsert)).toHaveLength(
      generated.questionnaires.length,
    );
  });

  it('recognises every town and produces each kind of listing', () => {
    expect(rows.every((row) => row.town !== null)).toBe(true);
    expect(new Set(rows.map((row) => row.property_kind))).toEqual(
      new Set(['residential', 'plot', 'commercial']),
    );
  });

  it('keeps the questions with no right answer at zero rows', () => {
    const homes = rows.filter((row) => row.property_kind === 'residential');
    expect(homes.filter((row) => row.town === 'Westhill' && row.price < 50_000)).toEqual([]);
    expect(
      homes.filter(
        (row) => row.town === 'Aberdeen' && (row.bedrooms ?? 0) >= 5 && row.price < 100_000,
      ),
    ).toEqual([]);
    expect(
      rows.filter((row) => row.town === 'Stonehaven' && row.property_kind === 'commercial'),
    ).toEqual([]);
  });
});
