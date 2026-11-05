import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawRow } from './raw-row.ts';
import { disclosureColumns, toDisclosureInsert } from './disclosure-mapper.ts';
import {
  dedupeByAddress,
  propertyColumns,
  toPropertyInsert,
  type PropertyInsert,
} from './property-mapper.ts';

const listing: RawRow = {
  id: '1',
  full_address: '20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK',
  post_code: 'AB21 9CK',
  price: '229000',
  area_m2: '97',
  council_tax: 'E',
  bedroom: '3',
  bathroom: '2',
  publicroom: '1',
  house_floor: null,
  has_garage: '1',
  has_garden: '1',
  has_off_street_parking: '1',
  has_double_garage: '0',
  allows_pets: '0',
};

describe('toPropertyInsert', () => {
  it('maps a listing into typed columns', () => {
    expect(toPropertyInsert(listing)).toMatchObject({
      id: 1,
      post_code: 'AB21 9CK',
      postcode_district: 'AB21',
      town: 'Aberdeen',
      price: 229000,
      area_m2: 97,
      council_tax_band: 'E',
      bedrooms: 3,
      property_kind: 'residential',
      has_garage: true,
      has_double_garage: false,
    });
  });

  it('stores missing measurements as null instead of zero', () => {
    const row = toPropertyInsert({ ...listing, area_m2: '0', bathroom: '0', council_tax: 'TBC' });

    expect(row.area_m2).toBeNull();
    expect(row.bathrooms).toBeNull();
    expect(row.council_tax_band).toBeNull();
  });

  it('leaves out the flags that are constant across the whole source', () => {
    expect(toPropertyInsert(listing)).not.toHaveProperty('allows_pets');
  });
});

describe('dedupeByAddress', () => {
  it('keeps the first listing per address and reports the rest', () => {
    const rows = [
      { id: 1, full_address: '1 Tolland Street, Ellon' },
      { id: 2, full_address: '2 Tolland Street, Ellon' },
      { id: 3, full_address: '1 tolland street, Ellon' },
    ] as PropertyInsert[];

    const result = dedupeByAddress(rows);

    expect(result.rows.map((row) => row.id)).toEqual([1, 2]);
    expect(result.dropped).toEqual([{ id: 3, keptId: 1, address: '1 tolland street, Ellon' }]);
  });
});

describe('toDisclosureInsert', () => {
  const questionnaire: RawRow = {
    id: '10',
    property_id: '1',
    length_of_ownership: '10 years',
    heating_type: 'Gas-fired',
    parking_arrangements: 'in the driveway',
    gas_supply: 'Example Energy',
    gas_supplier: 'Example Energy',
    telephone: '07700900123',
    telephone_supplier: '07700900123',
    asbestos_presence: 'Yes, mentioned for the outbuilding in a report',
    received_notices: 'Yes',
    notice_details: 'Neighbouring property applied for an extension',
    structural_damage: null,
  };

  it('maps answers, suppliers and durations', () => {
    const row = toDisclosureInsert(questionnaire);

    expect(row.property_id).toBe(1);
    expect(row.heating_type).toBe('gas');
    expect(row.ownership_months).toBe(120);
    expect(row['gas_supply']).toBe('yes');
    expect(row['gas_supplier']).toBe('Example Energy');
    expect(row['asbestos']).toBe('yes');
    expect(row['asbestos_detail']).toContain('outbuilding');
  });

  it('records an unanswered question as unknown, not no', () => {
    expect(toDisclosureInsert(questionnaire)['structural_damage']).toBe('unknown');
  });

  it('drops free text that names a person or their circumstances', () => {
    const row = toDisclosureInsert({
      ...questionnaire,
      specialist_work:
        'Yes, my late father arranged damp proofing through Mr Smith of Aberdeen Damp Ltd',
    });

    expect(row['specialist_work']).toBe('yes');
    expect(row['specialist_work_detail']).toBeNull();
  });

  it('never imports a phone number', () => {
    const row = toDisclosureInsert(questionnaire);

    expect(row['telephone_line']).toBe('yes');
    expect(JSON.stringify(row)).not.toContain('07700900123');
    expect(Object.keys(row)).not.toContain('telephone_supplier');
  });

  it('prefers the dedicated notice text over the yes answer', () => {
    expect(toDisclosureInsert(questionnaire)['received_notices_detail']).toBe(
      'Neighbouring property applied for an extension',
    );
  });
});

describe('schema', () => {
  const schema = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'schema.sql'),
    'utf8',
  );

  it('declares every column the import writes', () => {
    for (const column of [...propertyColumns(), ...disclosureColumns()]) {
      expect(schema).toContain(`\n  ${column} `);
    }
  });

  it('lists exactly the fields a mapped listing carries', () => {
    expect(propertyColumns().sort()).toEqual(Object.keys(toPropertyInsert(listing)).sort());
  });
});
