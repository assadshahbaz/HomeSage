import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SQL_ERROR_CODE, sqlRequestSchema } from '../../contracts/index.js';
import type { SqlError, SqlRequest, SqlResponse } from '../../contracts/index.js';
import { Throttle } from '../../platform/throttler/throttle.decorator.js';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { SqlQueryService } from './sql-query.service.js';

@Controller('sql')
export class SqlController {
  public constructor(private readonly sql: SqlQueryService) {}

  /**
   * Answers a question with the SQL that ran and its rows. A query the
   * validator refused, or a question the model declined, is a 422 carrying a
   * code and never the validator's detail, the model's text or a database error.
   */
  @Post()
  // Every call can cost a model call, so one caller cannot drain the budget.
  @Throttle('sql')
  // Nothing is created: the question is read, so success is 200 rather than 201.
  @HttpCode(HttpStatus.OK)
  public async ask(
    @Body(new ZodValidationPipe(sqlRequestSchema)) body: SqlRequest,
  ): Promise<SqlResponse> {
    const result = await this.sql.run(body.question);

    switch (result.status) {
      case 'answered': {
        const answered = { question: body.question, sql: result.sql, corrected: result.corrected };
        const { answer } = result;
        return answer.kind === 'rows'
          ? {
              kind: 'rows',
              ...answered,
              rows: answer.rows,
              rowCount: answer.rows.length,
              ordered: answer.ordered,
            }
          : {
              kind: 'aggregate',
              ...answered,
              values: answer.values,
              listingCount: answer.listingCount,
            };
      }
      case 'declined':
        throw new UnprocessableEntityException({
          errorCode: SQL_ERROR_CODE.DECLINED,
          message: 'This question cannot be answered from the listing data',
        } satisfies SqlError);
      case 'rejected':
        throw new UnprocessableEntityException({
          errorCode: SQL_ERROR_CODE.REJECTED,
          message: 'The generated query was rejected',
          reason: result.reason,
        } satisfies SqlError);
    }
  }
}
