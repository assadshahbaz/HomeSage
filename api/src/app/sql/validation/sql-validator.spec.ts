import { readFileSync } from 'node:fs';
import sqlParser from 'node-sql-parser';
import { z } from 'zod';
import { repoPath } from '../../../../tools/repo-path.js';
import { SqlValidator } from './sql-validator.js';
import { SQL_REJECTION } from './sql-validation-result.js';
import type { SqlRejection, SqlValidationResult } from './sql-validation-result.js';

const ROW_LIMIT = 50;

// Shared with the eval run, which reports the same cases next to the golden set.
const INJECTION_CASES = z
  .array(z.object({ name: z.string(), sql: z.string() }))
  .parse(JSON.parse(readFileSync(repoPath('workbench/evals/sql/injection-cases.json'), 'utf8')));

const validator = new SqlValidator(ROW_LIMIT);

function accepted(sql: string): string {
  const result = validator.validate(sql);
  if (!result.ok) {
    throw new Error(`expected ${sql} to pass, got ${result.reason}: ${result.detail}`);
  }
  return result.sql;
}

function rejectionOf(sql: string): { reason: SqlRejection; detail: string } {
  const result: SqlValidationResult = validator.validate(sql);
  if (result.ok) {
    throw new Error(`expected ${sql} to be rejected, got ${result.sql}`);
  }
  return { reason: result.reason, detail: result.detail };
}

describe('SqlValidator', () => {
  describe('accepts the queries the prompt asks for', () => {
    it.each([
      'SELECT id, price FROM properties WHERE price < 200000 AND bedrooms >= 3',
      "SELECT p.id, p.town FROM properties p WHERE p.town = 'Ellon' ORDER BY p.price DESC",
      "SELECT p.id FROM properties p LEFT JOIN property_disclosures d ON d.property_id = p.id AND d.heating_type = 'gas'",
      'SELECT town, COUNT(*) AS listings, AVG(price) AS average FROM properties GROUP BY town HAVING COUNT(*) > 5 ORDER BY listings DESC',
      "SELECT id FROM properties WHERE id IN (SELECT property_id FROM property_disclosures WHERE broadband = 'yes')",
      "SELECT p.id FROM properties p WHERE EXISTS (SELECT 1 FROM property_disclosures d WHERE d.property_id = p.id AND d.mains_drainage = 'no')",
      'WITH cheap AS (SELECT id, price FROM properties WHERE price < 100000) SELECT cheap.id FROM cheap ORDER BY cheap.price',
      'SELECT t.town, t.n FROM (SELECT town, COUNT(*) AS n FROM properties GROUP BY town) t ORDER BY t.n DESC',
      "SELECT id, CASE WHEN has_garden THEN 'garden' ELSE 'none' END AS outside FROM properties",
      'SELECT id, ROUND(price / area_m2) AS per_m2 FROM properties WHERE area_m2 IS NOT NULL',
      'SELECT PRICE FROM properties',
    ])('%s', (sql) => {
      expect(accepted(sql)).toMatch(/LIMIT \d+$/);
    });
  });

  describe('rewrites', () => {
    it('adds the cap when a query has no LIMIT', () => {
      expect(accepted('SELECT id FROM properties')).toBe('SELECT `id` FROM `properties` LIMIT 50');
    });

    it('lowers a LIMIT above the cap', () => {
      expect(accepted('SELECT id FROM properties LIMIT 500')).toBe(
        'SELECT `id` FROM `properties` LIMIT 50',
      );
    });

    it('keeps a LIMIT at or below the cap', () => {
      expect(accepted('SELECT id FROM properties LIMIT 10')).toBe(
        'SELECT `id` FROM `properties` LIMIT 10',
      );
    });

    it('lowers the count and keeps the offset in LIMIT offset, count', () => {
      expect(accepted('SELECT id FROM properties LIMIT 20, 500')).toBe(
        'SELECT `id` FROM `properties` LIMIT 20, 50',
      );
    });

    it('lowers the count and keeps the offset in LIMIT count OFFSET offset', () => {
      expect(accepted('SELECT id FROM properties LIMIT 500 OFFSET 20')).toBe(
        'SELECT `id` FROM `properties` LIMIT 50 OFFSET 20',
      );
    });

    it('lowers a LIMIT too big for a JavaScript number', () => {
      expect(accepted('SELECT id FROM properties LIMIT 18446744073709551615')).toBe(
        'SELECT `id` FROM `properties` LIMIT 50',
      );
    });

    it('caps the outer query, not a subquery', () => {
      expect(
        accepted('SELECT t.id FROM (SELECT id FROM properties ORDER BY price LIMIT 5) t'),
      ).toBe(
        'SELECT `t`.`id` FROM (SELECT `id` FROM `properties` ORDER BY `price` ASC LIMIT 5) AS `t` LIMIT 50',
      );
    });

    it('takes the cap from its constructor', () => {
      const result = new SqlValidator(7).validate('SELECT id FROM properties LIMIT 500');
      expect(result).toEqual({
        ok: true,
        sql: 'SELECT `id` FROM `properties` LIMIT 7',
        shape: { kind: 'rows', ordered: false },
      });
    });

    it('prints the query from the parse tree, dropping comments', () => {
      expect(accepted('SELECT id /* note */ FROM properties -- trailing')).toBe(
        'SELECT `id` FROM `properties` LIMIT 50',
      );
    });
  });

  describe('rejections', () => {
    it.each<[string, string, SqlRejection]>([
      ['text that is not SQL', 'show me flats in Ellon', SQL_REJECTION.PARSE_ERROR],
      ['an empty string', '', SQL_REJECTION.PARSE_ERROR],
      [
        'two statements',
        'SELECT id FROM properties; SELECT id FROM properties',
        SQL_REJECTION.MULTIPLE_STATEMENTS,
      ],
      ['an UPDATE', 'UPDATE properties SET price = 1', SQL_REJECTION.NOT_SELECT],
      ['a DELETE', 'DELETE FROM properties', SQL_REJECTION.NOT_SELECT],
      ['an INSERT', 'INSERT INTO properties (id) VALUES (1)', SQL_REJECTION.NOT_SELECT],
      ['a DROP', 'DROP TABLE properties', SQL_REJECTION.NOT_SELECT],
      [
        'a UNION of allowed tables',
        'SELECT id FROM properties UNION SELECT property_id FROM property_disclosures',
        SQL_REJECTION.SET_OPERATION,
      ],
      [
        'a parenthesised UNION',
        '(SELECT id FROM properties) UNION (SELECT property_id FROM property_disclosures) LIMIT 5',
        SQL_REJECTION.SET_OPERATION,
      ],
      ['a table off the allow list', 'SELECT id FROM users', SQL_REJECTION.TABLE_NOT_ALLOWED],
      [
        'a database qualified table',
        'SELECT id FROM homesage.properties',
        SQL_REJECTION.TABLE_NOT_ALLOWED,
      ],
      [
        'a table name in the wrong case',
        'SELECT id FROM PROPERTIES',
        SQL_REJECTION.TABLE_NOT_ALLOWED,
      ],
      [
        'a recursive CTE',
        'WITH RECURSIVE n AS (SELECT 1 AS x UNION ALL SELECT x + 1 FROM n) SELECT x FROM n',
        SQL_REJECTION.SET_OPERATION,
      ],
      [
        'a CTE that reads itself',
        'WITH n AS (SELECT x FROM n) SELECT x FROM n',
        SQL_REJECTION.TABLE_NOT_ALLOWED,
      ],
      [
        'a column the doc keeps out',
        'SELECT house_floor FROM properties',
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      ],
      ['an invented column', 'SELECT epc_rating FROM properties', SQL_REJECTION.COLUMN_NOT_ALLOWED],
      [
        'a column on the wrong table',
        'SELECT p.price FROM property_disclosures p',
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      ],
      [
        'an unknown qualifier',
        'SELECT x.price FROM properties p',
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      ],
      [
        'a database qualified column',
        'SELECT homesage.properties.price FROM properties',
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      ],
      ['SELECT *', 'SELECT * FROM properties', SQL_REJECTION.COLUMN_NOT_ALLOWED],
      ['a qualified star', 'SELECT p.* FROM properties p', SQL_REJECTION.COLUMN_NOT_ALLOWED],
      [
        'a column in WHERE the doc keeps out',
        "SELECT id FROM properties WHERE parking_arrangements = 'x'",
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      ],
      [
        'a column in ON the doc keeps out',
        'SELECT p.id FROM properties p JOIN property_disclosures d ON d.gas_supplier = p.town',
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      ],
      [
        'a USING column off the allow list',
        'SELECT p.id FROM properties p JOIN property_disclosures d USING (created_at)',
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      ],
      [
        'a column a derived table does not expose',
        'SELECT t.price FROM (SELECT id FROM properties) t',
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      ],
      [
        'a select alias used in WHERE to shadow a real column',
        'SELECT id, 1 AS house_floor FROM properties WHERE house_floor = 3',
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      ],
      [
        'a select alias used in GROUP BY to shadow a real column',
        'SELECT 1 AS updated_at, COUNT(*) AS n FROM properties GROUP BY updated_at',
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      ],
      [
        'an inner column falling through to an outer alias',
        'SELECT t.house_floor FROM (SELECT id AS house_floor FROM properties) t WHERE EXISTS (SELECT 1 FROM properties WHERE house_floor = 1)',
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      ],
      [
        'LOAD_FILE',
        "SELECT LOAD_FILE('/etc/passwd') FROM properties",
        SQL_REJECTION.FUNCTION_NOT_ALLOWED,
      ],
      ['SLEEP', 'SELECT id FROM properties WHERE SLEEP(5) = 0', SQL_REJECTION.FUNCTION_NOT_ALLOWED],
      [
        'BENCHMARK',
        "SELECT BENCHMARK(1000000, MD5('x')) FROM properties",
        SQL_REJECTION.FUNCTION_NOT_ALLOWED,
      ],
      [
        'a function that reads server state',
        'SELECT DATABASE()',
        SQL_REJECTION.FUNCTION_NOT_ALLOWED,
      ],
      [
        'a function inside an aggregate',
        'SELECT MAX(SLEEP(1)) FROM properties',
        SQL_REJECTION.FUNCTION_NOT_ALLOWED,
      ],
      ['INTO OUTFILE', "SELECT id FROM properties INTO OUTFILE '/tmp/out'", SQL_REJECTION.INTO],
      ['INTO DUMPFILE', "SELECT id FROM properties INTO DUMPFILE '/tmp/out'", SQL_REJECTION.INTO],
      ['INTO a variable', 'SELECT id INTO @v FROM properties', SQL_REJECTION.INTO],
      ['a variable assignment', 'SELECT @x := price FROM properties', SQL_REJECTION.VARIABLE],
      ['a user variable', 'SELECT id FROM properties WHERE price > @floor', SQL_REJECTION.VARIABLE],
      ['a system variable', 'SELECT @@version', SQL_REJECTION.VARIABLE],
      ['FOR UPDATE', 'SELECT id FROM properties FOR UPDATE', SQL_REJECTION.LOCKING_READ],
      ['a placeholder LIMIT', 'SELECT id FROM properties LIMIT ?', SQL_REJECTION.INVALID_LIMIT],
      ['a negative LIMIT', 'SELECT id FROM properties LIMIT -1', SQL_REJECTION.INVALID_LIMIT],
    ])('rejects %s', (_, sql, reason) => {
      const rejection = rejectionOf(sql);
      expect(rejection.reason).toBe(reason);
      expect(rejection.detail).not.toBe('');
    });

    it('names the column it refused', () => {
      expect(rejectionOf('SELECT house_floor FROM properties').detail).toContain('house_floor');
    });

    it('names the function it refused', () => {
      expect(rejectionOf('SELECT SLEEP(1) FROM properties').detail).toContain('SLEEP');
    });
  });

  describe('injection suite', () => {
    it.each(INJECTION_CASES.map(({ name, sql }) => [name, sql]))('rejects %s', (_, sql) => {
      const result = validator.validate(sql);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(Object.values(SQL_REJECTION)).toContain(result.reason);
        expect(result.detail).not.toBe('');
      }
    });

    it('never passes a MySQL executable comment through to the database', () => {
      const sql = accepted(
        'SELECT id FROM properties /*!50000 UNION SELECT user FROM mysql.user */',
      );
      expect(sql).toBe('SELECT `id` FROM `properties` LIMIT 50');
    });
  });
  describe('scopes and sources', () => {
    it('reads a CTE through the column names it declares', () => {
      expect(accepted('WITH c (a) AS (SELECT id FROM properties) SELECT c.a FROM c')).toContain(
        'WITH `c`(`a`)',
      );
    });

    it('refuses the original name behind a CTE column list', () => {
      expect(
        rejectionOf('WITH c (a) AS (SELECT id FROM properties) SELECT c.id FROM c').reason,
      ).toBe(SQL_REJECTION.COLUMN_NOT_ALLOWED);
    });

    it('accepts a query on DUAL, which reads no table', () => {
      expect(accepted('SELECT 1 AS one FROM DUAL')).toContain('FROM DUAL');
    });

    it('resolves a column in a subquery that reads only derived tables against the query around it', () => {
      accepted(
        'SELECT p.id FROM properties p WHERE EXISTS (SELECT 1 FROM (SELECT 1 AS one) x WHERE price > 1)',
      );
    });

    it('still refuses a forbidden column that falls through to the query around it', () => {
      expect(
        rejectionOf(
          'SELECT p.id FROM properties p WHERE EXISTS (SELECT 1 FROM (SELECT 1 AS one) x WHERE house_floor > 1)',
        ).reason,
      ).toBe(SQL_REJECTION.COLUMN_NOT_ALLOWED);
    });

    it('refuses a column of a derived table that has no alias', () => {
      expect(rejectionOf('SELECT x.id FROM (SELECT id FROM properties)').reason).toBe(
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      );
    });

    it('refuses a UNION hidden inside a subquery', () => {
      expect(
        rejectionOf(
          'SELECT id FROM properties WHERE id IN (SELECT id FROM properties UNION SELECT property_id FROM property_disclosures)',
        ).reason,
      ).toBe(SQL_REJECTION.SET_OPERATION);
    });

    it('refuses LOCK IN SHARE MODE like FOR UPDATE', () => {
      expect(rejectionOf('SELECT id FROM properties LOCK IN SHARE MODE')).toEqual({
        reason: SQL_REJECTION.LOCKING_READ,
        detail: 'LOCK IN SHARE MODE is not allowed; a query only reads',
      });
    });

    it('accepts COUNT(DISTINCT ...)', () => {
      accepted('SELECT COUNT(DISTINCT p.town) AS towns FROM properties p');
    });
  });

  // The walker trusts nothing about the tree the parser hands it. These feed it
  // shapes today's parser never produces, as a later version might, and check
  // that each one is refused rather than let through unchecked.
  describe('parse trees it does not recognise', () => {
    const FROM_PROPERTIES = [{ db: null, table: 'properties', as: null }];

    function select(overrides: Record<string, unknown>): Record<string, unknown> {
      return {
        type: 'select',
        columns: [{ expr: { type: 'column_ref', table: null, column: 'id' }, as: null }],
        from: FROM_PROPERTIES,
        limit: null,
        ...overrides,
      };
    }

    function verdictFor(tree: unknown): SqlValidationResult {
      vi.spyOn(sqlParser.Parser.prototype, 'astify').mockReturnValueOnce(tree as never);
      return validator.validate('SELECT id FROM properties');
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each<[string, unknown, SqlRejection]>([
      ['a statement with no readable type', { type: 42 }, SQL_REJECTION.NOT_SELECT],
      [
        'a select list that is not a list',
        select({ columns: '*' }),
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      ],
      [
        'a select list item that is not a node',
        select({ columns: ['house_floor'] }),
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      ],
      [
        'a column reference with no column name',
        select({ columns: [{ expr: { type: 'column_ref', table: null, column: null } }] }),
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
      ],
      [
        'a FROM item that is not a node',
        select({ from: ['properties'] }),
        SQL_REJECTION.TABLE_NOT_ALLOWED,
      ],
      [
        'a FROM item with no table',
        select({ from: [{ as: 'x' }] }),
        SQL_REJECTION.TABLE_NOT_ALLOWED,
      ],
      [
        'a CTE with no name',
        select({ with: [{ name: null, stmt: { ast: select({}) } }] }),
        SQL_REJECTION.TABLE_NOT_ALLOWED,
      ],
      [
        'a CTE with no body',
        select({ with: [{ name: { value: 'c' }, stmt: {} }] }),
        SQL_REJECTION.TABLE_NOT_ALLOWED,
      ],
      [
        'a function with no readable name',
        select({
          columns: [
            { expr: { type: 'function', name: {}, args: { type: 'expr_list', value: [] } } },
          ],
        }),
        SQL_REJECTION.FUNCTION_NOT_ALLOWED,
      ],
      [
        'a function named by parts that are not identifiers',
        select({
          columns: [
            {
              expr: {
                type: 'function',
                name: { name: [42] },
                args: { type: 'expr_list', value: [] },
              },
            },
          ],
        }),
        SQL_REJECTION.FUNCTION_NOT_ALLOWED,
      ],
      [
        'a bare nested SELECT on a forbidden table',
        select({ where: select({ from: [{ db: 'mysql', table: 'user', as: null }] }) }),
        SQL_REJECTION.TABLE_NOT_ALLOWED,
      ],
    ])('refuses %s', (_, tree, reason) => {
      expect(verdictFor(tree)).toMatchObject({ ok: false, reason });
    });

    it('names an unreadable statement type as unknown', () => {
      expect(verdictFor({ type: 42 })).toMatchObject({
        detail: 'only SELECT may run, found UNKNOWN',
      });
    });

    it('reports a parser failure that is not an Error as a parse error', () => {
      vi.spyOn(sqlParser.Parser.prototype, 'astify').mockImplementationOnce(() => {
        // Deliberately not an Error, as some parsers throw plain values.
        throw 'unexpected end of input' as unknown as Error;
      });

      expect(validator.validate('SELECT')).toEqual({
        ok: false,
        reason: SQL_REJECTION.PARSE_ERROR,
        detail: 'unexpected end of input',
      });
    });

    it('checks a column written in the newer wrapped identifier shape', () => {
      const wrapped = select({
        columns: [
          {
            expr: {
              type: 'column_ref',
              table: null,
              column: { expr: { type: 'default', value: 'house_floor' } },
            },
          },
        ],
      });

      expect(verdictFor(wrapped)).toMatchObject({
        ok: false,
        reason: SQL_REJECTION.COLUMN_NOT_ALLOWED,
      });
    });
  });
  describe('answer shape', () => {
    function shapeOf(sql: string): unknown {
      const result = validator.validate(sql);
      if (!result.ok) {
        throw new Error(`expected ${sql} to pass, got ${result.reason}: ${result.detail}`);
      }
      return result.shape;
    }

    it.each([
      ['a plain listing query', 'SELECT p.id FROM properties p', false],
      ['listings with an ORDER BY', 'SELECT p.id FROM properties p ORDER BY p.price', true],
      ['DISTINCT values with no aggregate', 'SELECT DISTINCT p.town FROM properties p', false],
      [
        'one group per listing id',
        'SELECT p.id, COUNT(*) AS n FROM properties p GROUP BY p.id ORDER BY n',
        true,
      ],
      [
        'one group per disclosure row',
        'SELECT d.property_id FROM property_disclosures d GROUP BY d.property_id',
        false,
      ],
      [
        'a window function, which gives one value per row',
        'SELECT p.id, SUM(p.price) OVER () AS total FROM properties p',
        false,
      ],
      [
        'an aggregate only inside a subquery',
        'SELECT p.id FROM properties p WHERE p.price > (SELECT AVG(price) FROM properties)',
        false,
      ],
    ])('reads %s as rows', (_, sql, ordered) => {
      expect(shapeOf(sql)).toEqual({ kind: 'rows', ordered });
    });

    it.each([
      ['COUNT(*)', 'SELECT COUNT(*) AS n FROM properties p'],
      ['an aggregate inside another function', 'SELECT ROUND(AVG(p.price)) AS a FROM properties p'],
      ['arithmetic on an aggregate', 'SELECT COUNT(*) + 1 AS n FROM properties p'],
      ['a GROUP BY with no aggregate', 'SELECT p.town FROM properties p GROUP BY p.town'],
      [
        'a GROUP BY ordered by an aggregate',
        'SELECT p.town FROM properties p GROUP BY p.town ORDER BY COUNT(*) DESC',
      ],
      [
        'an aggregate next to its grouped column',
        'SELECT p.town, COUNT(*) AS n FROM properties p GROUP BY p.town',
      ],
    ])('reads %s as an aggregate', (_, sql) => {
      expect(shapeOf(sql)).toEqual({ kind: 'aggregate', countColumn: 'homesage_listing_count' });
    });

    it('appends the listing count after the columns the model chose', () => {
      expect(
        accepted('SELECT p.town, COUNT(*) AS n FROM properties p GROUP BY p.town ORDER BY 2 DESC'),
      ).toBe(
        'SELECT `p`.`town`, COUNT(*) AS `n`, COUNT(*) AS `homesage_listing_count` FROM `properties` AS `p` GROUP BY `p`.`town` ORDER BY 2 DESC LIMIT 50',
      );
    });

    it('leaves a listing query without the count column', () => {
      expect(accepted('SELECT p.id FROM properties p')).not.toContain('homesage_listing_count');
    });

    it.each([
      ['a plain column next to COUNT', 'SELECT p.town, COUNT(*) AS n FROM properties p'],
      [
        'a plain column inside an expression',
        'SELECT p.price - AVG(p.price) AS gap FROM properties p',
      ],
    ])('rejects %s with no GROUP BY, rather than guessing', (_, sql) => {
      expect(rejectionOf(sql)).toEqual({
        reason: SQL_REJECTION.MIXED_AGGREGATE,
        detail: 'an aggregate next to a plain column needs a GROUP BY on that column',
      });
    });
  });
});
