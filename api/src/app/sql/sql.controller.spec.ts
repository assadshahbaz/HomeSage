import { HttpStatus, UnprocessableEntityException } from '@nestjs/common';
import type { SqlQueryResult } from './sql-query-result.js';
import type { SqlQueryService } from './sql-query.service.js';
import type { ValidatedSql } from './validation/sql-validation-result.js';
import { SqlController } from './sql.controller.js';

const QUESTION = '3 bed houses in AB15 under 300k';
const SQL =
  "SELECT `p`.`id` FROM `properties` AS `p` WHERE `p`.`postcode_district` = 'AB15' LIMIT 50" as ValidatedSql;

function controllerReturning(result: Promise<SqlQueryResult>): SqlController {
  const service = { run: vi.fn(() => result) } as unknown as SqlQueryService;
  return new SqlController(service);
}

async function thrownBy(call: Promise<unknown>): Promise<UnprocessableEntityException> {
  const error = await call.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(UnprocessableEntityException);
  return error as UnprocessableEntityException;
}

describe('SqlController', () => {
  it('returns listings as kind rows, with the SQL that ran, their count and the ordered flag', async () => {
    const rows = [{ id: 2494 }, { id: 428 }];
    const controller = controllerReturning(
      Promise.resolve({
        status: 'answered',
        sql: SQL,
        answer: { kind: 'rows', rows, ordered: true },
        corrected: true,
      }),
    );

    await expect(controller.ask({ question: QUESTION })).resolves.toEqual({
      kind: 'rows',
      question: QUESTION,
      sql: SQL,
      rows,
      rowCount: 2,
      ordered: true,
      corrected: true,
    });
  });

  it('returns computed values as kind aggregate, with the listing count and no rows', async () => {
    const controller = controllerReturning(
      Promise.resolve({
        status: 'answered',
        sql: SQL,
        answer: {
          kind: 'aggregate',
          values: [{ average_price: '221388.8889' }],
          listingCount: 45,
        },
        corrected: false,
      }),
    );

    await expect(controller.ask({ question: 'average price in Banchory' })).resolves.toEqual({
      kind: 'aggregate',
      question: 'average price in Banchory',
      sql: SQL,
      values: [{ average_price: '221388.8889' }],
      listingCount: 45,
      corrected: false,
    });
  });

  it('returns an empty result as rows, not as an error', async () => {
    const controller = controllerReturning(
      Promise.resolve({
        status: 'answered',
        sql: SQL,
        answer: { kind: 'rows', rows: [], ordered: false },
        corrected: false,
      }),
    );

    await expect(controller.ask({ question: QUESTION })).resolves.toMatchObject({
      kind: 'rows',
      rows: [],
      rowCount: 0,
    });
  });

  it('answers a rejected query with 422, E_SQL_REJECTED and the reason, but not the detail', async () => {
    const controller = controllerReturning(
      Promise.resolve({
        status: 'rejected',
        reason: 'table_not_allowed',
        detail: 'mysql.user is not allowed',
      }),
    );

    const error = await thrownBy(controller.ask({ question: QUESTION }));

    expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(error.getResponse()).toEqual({
      errorCode: 'E_SQL_REJECTED',
      message: 'The generated query was rejected',
      reason: 'table_not_allowed',
    });
  });

  it('answers a declined question with 422 and E_SQL_DECLINED', async () => {
    const controller = controllerReturning(Promise.resolve({ status: 'declined' }));

    const error = await thrownBy(controller.ask({ question: 'EPC band B homes' }));

    expect(error.getResponse()).toEqual({
      errorCode: 'E_SQL_DECLINED',
      message: 'This question cannot be answered from the listing data',
    });
  });

  it('lets a failure from the service through for the filter to shape', async () => {
    const failure = new UnprocessableEntityException({ errorCode: 'E_SQL_FAILED', message: 'x' });
    const controller = controllerReturning(Promise.reject(failure));

    await expect(controller.ask({ question: QUESTION })).rejects.toBe(failure);
  });
});
