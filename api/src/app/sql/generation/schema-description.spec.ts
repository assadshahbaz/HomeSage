import { readFileSync } from 'node:fs';
import { repoPath } from '../../../../tools/repo-path.js';
import { allowedColumns, allowedTables } from '../validation/sql-allow-list.js';
import { describeSchema, joinClause } from './schema-description.js';

// Checkouts on Windows carry CRLF, so normalise before anything matches on line ends.
const schemaDoc = readFileSync(repoPath('docs/schema.md'), 'utf8').replace(/\r\n/g, '\n');

// Columns the database has and the allow list leaves out, one of each kind.
const EXCLUDED = [
  'house_floor',
  'created_at',
  'updated_at',
  'parking_arrangements',
  'gas_supplier',
  'windows_replaced_detail',
];

describe('joinClause', () => {
  it('is the join the schema doc recommends', () => {
    expect(joinClause()).toBe('LEFT JOIN property_disclosures d ON d.property_id = p.id');
    expect(schemaDoc).toContain(joinClause());
  });
});

describe('describeSchema', () => {
  const description = describeSchema();
  const described = [...description.matchAll(/^- ([a-z0-9_]+) /gm)].map((match) => match[1]);

  it('names exactly the allowed columns, in schema order', () => {
    expect(described).toEqual(allowedTables().flatMap((table) => allowedColumns(table)));
  });

  it.each(EXCLUDED)('never names %s, which the validator would reject', (column) => {
    expect(description).not.toMatch(new RegExp(`\\b${column}\\b`));
  });

  it('gives each column its type and says which ones can be null', () => {
    expect(description).toContain('- price INT UNSIGNED: ');
    expect(description).toContain('- area_m2 SMALLINT UNSIGNED NULL: ');
    expect(description).toContain("- asbestos ENUM('yes','no','unknown','not_applicable'): ");
  });

  it('describes both tables with their aliases and the join between them', () => {
    expect(description).toContain('Table properties AS p: ');
    expect(description).toContain('Table property_disclosures AS d: ');
    expect(description).toContain(joinClause());
  });

  // Counts and ranges change with every import, so the prompt must not quote them.
  it('quotes no figures taken from the data', () => {
    expect(description.match(/\d[\d,]*\d{3}\b|\b\d+ (rows|listings)\b/g)).toBeNull();
  });

  it('warns that a false flag and an unknown answer are not a no', () => {
    expect(description).toMatch(/false flag .* not that the property lacks it/);
    expect(description).toMatch(/'unknown' means the seller did not answer/);
  });
});
