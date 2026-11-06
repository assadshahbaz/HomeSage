import type { ConfigService } from '@nestjs/config';
import type { MysqlService } from '../../../infra/mysql/mysql.service.js';
import { SqlExecutor } from './sql-executor.js';
import type { ValidatedSql } from '../validation/sql-validation-result.js';

const SQL =
  'SELECT `p`.`id`, `p`.`price` FROM `properties` AS `p` WHERE `p`.`id` = ? LIMIT 50' as ValidatedSql;
const TIMEOUT_MS = 1500;

function executorReturning(rows: unknown): {
  executor: SqlExecutor;
  queryWithTimeout: ReturnType<typeof vi.fn>;
} {
  const queryWithTimeout = vi.fn().mockResolvedValue(rows);
  const mysql = { queryWithTimeout } as unknown as MysqlService;
  const configService = {
    getOrThrow: () => ({ rowLimit: 50, statementTimeoutMs: TIMEOUT_MS }),
  } as unknown as ConfigService;
  return { executor: new SqlExecutor(mysql, configService), queryWithTimeout };
}

describe('SqlExecutor', () => {
  it('runs the query with bound parameters under the configured statement timeout', async () => {
    const { executor, queryWithTimeout } = executorReturning([]);

    await executor.execute(SQL, [1234]);

    expect(queryWithTimeout).toHaveBeenCalledWith(SQL, [1234], TIMEOUT_MS);
  });

  it('returns rows of strings, numbers, booleans and nulls as they came', async () => {
    const rows = [
      { id: 1234, full_address: '3 Market Cross Ellon, AB41 9CV', area_m2: null, has_garden: 1 },
      { town: 'Ellon', average_price: '187000.0000', listed: true },
    ];
    const { executor } = executorReturning(rows);

    await expect(executor.execute(SQL)).resolves.toEqual(rows);
  });

  it.each([
    ['a date', new Date('2025-04-13')],
    ['a buffer', Buffer.from('x')],
    ['a nested object', { nested: 1 }],
  ])('refuses a row holding %s rather than passing an unchecked shape on', async (_, cell) => {
    const { executor } = executorReturning([{ value: cell }]);

    await expect(executor.execute(SQL)).rejects.toThrow();
  });

  it('lets a MySQL error through for the caller to decide on', async () => {
    const failure = Object.assign(new Error('interrupted'), {
      errno: 3024,
      sqlMessage: 'interrupted',
    });
    const { executor, queryWithTimeout } = executorReturning([]);
    queryWithTimeout.mockRejectedValueOnce(failure);

    await expect(executor.execute(SQL)).rejects.toBe(failure);
  });
});
