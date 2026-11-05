import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.ts';
import { SqlExecutor } from '../src/app/sql/execution/sql-executor.ts';
import { SqlValidator } from '../src/app/sql/validation/sql-validator.ts';
import type { ValidatedSql } from '../src/app/sql/validation/sql-validation-result.ts';

// Short enough that the slow query below is cut off quickly, long enough for
// the ordinary ones to finish on a laptop.
const STATEMENT_TIMEOUT_MS = '1000';
const ROW_LIMIT = 50;

/**
 * Runs the executor against the MySQL container from docker-compose.yml, so the
 * data must be seeded first (`npm run db:seed`). Every query here goes
 * through the validator first, as generated SQL always does.
 */
describe('SqlExecutor against MySQL', () => {
  let app: TestingModule;
  let executor: SqlExecutor;
  const validator = new SqlValidator(ROW_LIMIT);

  function validated(sql: string): ValidatedSql {
    const verdict = validator.validate(sql);
    if (!verdict.ok) {
      throw new Error(`test query was rejected: ${verdict.detail}`);
    }
    return verdict.sql;
  }

  beforeAll(async () => {
    process.env['SQL_STATEMENT_TIMEOUT_MS'] = STATEMENT_TIMEOUT_MS;
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    executor = app.get(SqlExecutor, { strict: false });
  });

  afterAll(async () => {
    await app.close();
    delete process.env['SQL_STATEMENT_TIMEOUT_MS'];
  });

  it('returns the rows of a validated query, with bound parameters', async () => {
    const rows = await executor.execute(
      validated('SELECT p.id, p.town, p.price FROM properties p WHERE p.town = ? ORDER BY p.price'),
      ['Ellon'],
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(ROW_LIMIT);
    expect(rows[0]).toEqual({ id: expect.any(Number), town: 'Ellon', price: expect.any(Number) });
  });

  it('returns an aggregate MySQL sends as a DECIMAL string', async () => {
    const rows = await executor.execute(
      validated(
        'SELECT p.town, AVG(p.price) AS average FROM properties p WHERE p.town IS NOT NULL GROUP BY p.town',
      ),
    );

    expect(rows[0]?.['average']).toEqual(expect.any(String));
  });

  it('has MySQL cut off a slow query at the statement timeout instead of hanging', async () => {
    const slow = validated(
      'SELECT COUNT(*) AS n FROM properties a JOIN properties b ON a.price >= b.price JOIN properties c ON b.price >= c.price',
    );
    const startedAt = Date.now();

    await expect(executor.execute(slow)).rejects.toMatchObject({
      errno: 3024,
      code: 'ER_QUERY_TIMEOUT',
    });
    expect(Date.now() - startedAt).toBeLessThan(Number(STATEMENT_TIMEOUT_MS) * 5);
  });

  it('is refused a write by MySQL itself, not only by the validator', async () => {
    // Deliberately bypasses the validator with a cast: this proves the database
    // grant holds on the executor's own connection path if the validator ever didn't.
    const write = 'UPDATE properties SET price = price + 1 WHERE id = 1' as ValidatedSql;

    await expect(executor.execute(write)).rejects.toMatchObject({
      code: 'ER_TABLEACCESS_DENIED_ERROR',
    });
  });

  it('still runs queries after a timeout, so the connection went back healthy', async () => {
    const rows = await executor.execute(validated('SELECT p.id FROM properties p WHERE p.id = 1'));

    expect(rows).toEqual([{ id: 1 }]);
  });
});
