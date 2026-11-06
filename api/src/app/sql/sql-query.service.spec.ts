import { UnprocessableEntityException } from '@nestjs/common';
import type { AppLogger } from '../../platform/logging/app-logger.js';
import type { SqlExecutor } from './execution/sql-executor.js';
import type { SqlGenerationResult } from './generation/sql-generation-result.js';
import type { FailedAttempt, SqlGenerator } from './generation/sql-generator.js';
import { SqlQueryService } from './sql-query.service.js';
import type { SqlRow } from '../../contracts/index.js';
import type { ValidatedSql } from './validation/sql-validation-result.js';

const QUESTION = 'average price per town';
const FIRST_SQL =
  'SELECT `p`.`town`, `p`.`price` FROM `properties` AS `p` GROUP BY `p`.`town` LIMIT 50' as ValidatedSql;
const SECOND_SQL =
  'SELECT `p`.`town`, AVG(`p`.`price`) AS `average` FROM `properties` AS `p` GROUP BY `p`.`town` LIMIT 50' as ValidatedSql;
const ROWS_SHAPE = { kind: 'rows', ordered: false } as const;
const ROWS: SqlRow[] = [{ town: 'Ellon', average: '187000.0000' }];

/** A MySQL statement error, shaped the way mysql2 raises one. */
function mysqlError(errno: number, sqlMessage: string): Error {
  return Object.assign(new Error(sqlMessage), { errno, sqlMessage, sqlState: 'HY000' });
}

const GROUP_BY_ERROR = mysqlError(1055, 'Expression #2 of SELECT list is not in GROUP BY clause');
const TIMEOUT_ERROR = mysqlError(
  3024,
  'Query execution was interrupted, maximum statement execution time exceeded',
);

function build(
  generations: SqlGenerationResult[],
  executions: (SqlRow[] | Error)[],
): {
  service: SqlQueryService;
  generate: ReturnType<
    typeof vi.fn<(question: string, failed?: FailedAttempt) => Promise<SqlGenerationResult>>
  >;
  execute: ReturnType<typeof vi.fn<(sql: ValidatedSql) => Promise<SqlRow[]>>>;
  warn: ReturnType<typeof vi.fn>;
} {
  const generate =
    vi.fn<(question: string, failed?: FailedAttempt) => Promise<SqlGenerationResult>>();
  for (const generation of generations) {
    generate.mockResolvedValueOnce(generation);
  }
  const execute = vi.fn<(sql: ValidatedSql) => Promise<SqlRow[]>>();
  for (const execution of executions) {
    if (execution instanceof Error) {
      execute.mockRejectedValueOnce(execution);
    } else {
      execute.mockResolvedValueOnce(execution);
    }
  }
  const warn = vi.fn();
  const service = new SqlQueryService(
    { generate } as unknown as SqlGenerator,
    { execute } as unknown as SqlExecutor,
    { warn } as unknown as AppLogger,
  );
  return { service, generate, execute, warn };
}

describe('SqlQueryService', () => {
  it('returns the rows of a query that runs first time, with no retry', async () => {
    const { service, generate } = build(
      [{ status: 'valid', sql: FIRST_SQL, shape: ROWS_SHAPE }],
      [ROWS],
    );

    await expect(service.run(QUESTION)).resolves.toEqual({
      status: 'answered',
      sql: FIRST_SQL,
      answer: { kind: 'rows', rows: ROWS, ordered: false },
      corrected: false,
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('retries once with the failed query and the MySQL error, and returns the corrected rows', async () => {
    const { service, generate, execute, warn } = build(
      [
        { status: 'valid', sql: FIRST_SQL, shape: ROWS_SHAPE },
        { status: 'valid', sql: SECOND_SQL, shape: ROWS_SHAPE },
      ],
      [GROUP_BY_ERROR, ROWS],
    );

    await expect(service.run(QUESTION)).resolves.toEqual({
      status: 'answered',
      sql: SECOND_SQL,
      answer: { kind: 'rows', rows: ROWS, ordered: false },
      corrected: true,
    });
    expect(generate).toHaveBeenNthCalledWith(2, QUESTION, {
      sql: FIRST_SQL,
      error: GROUP_BY_ERROR.message,
    });
    expect(execute).toHaveBeenNthCalledWith(2, SECOND_SQL);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('retries a query MySQL stopped at the statement timeout', async () => {
    const { service, generate } = build(
      [
        { status: 'valid', sql: FIRST_SQL, shape: ROWS_SHAPE },
        { status: 'valid', sql: SECOND_SQL, shape: ROWS_SHAPE },
      ],
      [TIMEOUT_ERROR, ROWS],
    );

    await expect(service.run(QUESTION)).resolves.toMatchObject({ corrected: true });
    expect(generate.mock.calls[1][1]).toEqual({ sql: FIRST_SQL, error: TIMEOUT_ERROR.message });
  });

  it('throws when the corrected query fails too, and never asks a third time', async () => {
    const { service, generate, execute } = build(
      [
        { status: 'valid', sql: FIRST_SQL, shape: ROWS_SHAPE },
        { status: 'valid', sql: SECOND_SQL, shape: ROWS_SHAPE },
      ],
      [GROUP_BY_ERROR, TIMEOUT_ERROR],
    );

    const run = service.run(QUESTION);

    await expect(run).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(run).rejects.toMatchObject({
      response: { errorCode: 'E_SQL_FAILED', message: 'The generated query failed twice' },
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('keeps the database error out of the message the client sees', async () => {
    const { service } = build(
      [
        { status: 'valid', sql: FIRST_SQL, shape: ROWS_SHAPE },
        { status: 'valid', sql: SECOND_SQL, shape: ROWS_SHAPE },
      ],
      [GROUP_BY_ERROR, GROUP_BY_ERROR],
    );

    const error = await service.run(QUESTION).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(JSON.stringify((error as UnprocessableEntityException).getResponse())).not.toContain(
      'GROUP BY',
    );
  });

  it('returns the rejection when the correction fails the validator, and runs nothing more', async () => {
    const { service, execute } = build(
      [
        { status: 'valid', sql: FIRST_SQL, shape: ROWS_SHAPE },
        {
          status: 'rejected',
          reason: 'column_not_allowed',
          detail: 'column house_floor is not on the allow list',
          candidate: 'SELECT house_floor FROM properties',
        },
      ],
      [GROUP_BY_ERROR],
    );

    await expect(service.run(QUESTION)).resolves.toEqual({
      status: 'rejected',
      reason: 'column_not_allowed',
      detail: 'column house_floor is not on the allow list',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns a decline from the correction', async () => {
    const { service } = build(
      [{ status: 'valid', sql: FIRST_SQL, shape: ROWS_SHAPE }, { status: 'declined' }],
      [GROUP_BY_ERROR],
    );

    await expect(service.run(QUESTION)).resolves.toEqual({ status: 'declined' });
  });

  it('logs why the validator rejected a query, since the response will not carry it', async () => {
    const { service, warn } = build(
      [
        {
          status: 'rejected',
          reason: 'table_not_allowed',
          detail: 'mysql.user is not allowed',
          candidate: 'SELECT user FROM mysql.user',
        },
      ],
      [],
    );

    await service.run(QUESTION);

    expect(warn).toHaveBeenCalledWith(
      'Generated SQL was rejected by the validator',
      { reason: 'table_not_allowed', detail: 'mysql.user is not allowed' },
      'SqlQueryService',
    );
  });

  it('returns a first time decline without touching MySQL', async () => {
    const { service, execute } = build([{ status: 'declined' }], []);

    await expect(service.run(QUESTION)).resolves.toEqual({ status: 'declined' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns a first time rejection without touching MySQL or retrying', async () => {
    const { service, generate, execute } = build(
      [
        {
          status: 'rejected',
          reason: 'multiple_statements',
          detail: 'expected one statement, found 2',
          candidate: 'x',
        },
      ],
      [],
    );

    await expect(service.run(QUESTION)).resolves.toEqual({
      status: 'rejected',
      reason: 'multiple_statements',
      detail: 'expected one statement, found 2',
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not send a lost connection to the model, since no query can fix it', async () => {
    const lost = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), {
      code: 'ECONNREFUSED',
    });
    const { service, generate } = build(
      [{ status: 'valid', sql: FIRST_SQL, shape: ROWS_SHAPE }],
      [lost],
    );

    await expect(service.run(QUESTION)).rejects.toBe(lost);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('lets a lost connection on the retry through as it is', async () => {
    const lost = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), {
      code: 'ECONNREFUSED',
    });
    const { service } = build(
      [
        { status: 'valid', sql: FIRST_SQL, shape: ROWS_SHAPE },
        { status: 'valid', sql: SECOND_SQL, shape: ROWS_SHAPE },
      ],
      [GROUP_BY_ERROR, lost],
    );

    await expect(service.run(QUESTION)).rejects.toBe(lost);
  });
});
