import { extractSql } from './sql-extraction.js';

const SQL = 'SELECT p.id FROM properties p WHERE p.price < 300000';

describe('extractSql', () => {
  it.each([
    ['clean SQL', SQL],
    ['surrounding whitespace', `\n  ${SQL}  \n`],
    ['a sql code fence', '```sql\n' + SQL + '\n```'],
    ['a bare code fence', '```\n' + SQL + '\n```'],
    ['prose around a fence', 'Here is the query:\n```sql\n' + SQL + '\n```\nIt lists cheap homes.'],
    ['a line of prose before the SQL', 'Here is the query you asked for:\n' + SQL],
    ['prose that uses the word with', 'A query with one filter:\n' + SQL],
  ])('takes the query out of %s', (_, reply) => {
    expect(extractSql(reply)).toBe(SQL);
  });

  it('keeps a CTE that starts the reply', () => {
    const cte = 'WITH cheap AS (SELECT p.id FROM properties p) SELECT cheap.id FROM cheap';
    expect(extractSql(cte)).toBe(cte);
  });

  it('keeps a second statement, so the validator rejects it instead of it being cut off', () => {
    expect(extractSql(`${SQL}; DROP TABLE properties`)).toBe(`${SQL}; DROP TABLE properties`);
  });

  it('keeps prose after unfenced SQL, so the validator rejects it rather than guessing', () => {
    expect(extractSql(`${SQL}\nThis lists cheap homes.`)).toBe(`${SQL}\nThis lists cheap homes.`);
  });

  it('returns a reply with no SQL in it unchanged, apart from whitespace', () => {
    expect(extractSql('  CANNOT_ANSWER \n')).toBe('CANNOT_ANSWER');
  });

  it('returns an empty string for an empty reply', () => {
    expect(extractSql('')).toBe('');
  });
});
