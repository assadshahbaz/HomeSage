import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { SQL_ERROR_CODE } from '../../contracts/index.js';
import { AppLogger } from '../../platform/logging/app-logger.js';
import { mysqlQueryErrorMessage } from './execution/mysql-query-error.js';
import { toSqlAnswer } from './sql-answer.js';
import { SqlExecutor } from './execution/sql-executor.js';
import type { SqlGenerationResult } from './generation/sql-generation-result.js';
import { SqlGenerator } from './generation/sql-generator.js';
import type { SqlQueryResult } from './sql-query-result.js';
import type { ValidatedSql } from './validation/sql-validation-result.js';

type ValidGeneration = Extract<SqlGenerationResult, { status: 'valid' }>;

/**
 * Answers a question with rows: the model writes SQL, the validator checks it,
 * MySQL runs it. When MySQL refuses or stops the query, the model gets exactly
 * one chance to correct it, and the correction is validated again before it
 * runs. A second failure in MySQL ends the request.
 */
@Injectable()
export class SqlQueryService {
  public constructor(
    private readonly generator: SqlGenerator,
    private readonly executor: SqlExecutor,
    private readonly logger: AppLogger,
  ) {}

  /** Generates, validates and runs SQL for `question`, with one correction on a MySQL error. */
  public async run(question: string): Promise<SqlQueryResult> {
    const first = await this.generator.generate(question);
    if (first.status !== 'valid') {
      return this.withoutRows(first);
    }

    try {
      return await this.answer(first, false);
    } catch (error) {
      const message = mysqlQueryErrorMessage(error);
      if (message === undefined) {
        throw error;
      }
      // The failure changes what happens next rather than ending the request,
      // so it is recorded here before the correction is asked for.
      this.logger.warn(
        'Generated SQL failed in MySQL, asking the model for a correction',
        {
          error: message,
        },
        SqlQueryService.name,
      );
      return this.retry(question, first.sql, message);
    }
  }

  private async retry(
    question: string,
    failedSql: ValidatedSql,
    error: string,
  ): Promise<SqlQueryResult> {
    const second = await this.generator.generate(question, { sql: failedSql, error });
    if (second.status !== 'valid') {
      return this.withoutRows(second);
    }

    try {
      return await this.answer(second, true);
    } catch (retryError) {
      if (mysqlQueryErrorMessage(retryError) === undefined) {
        throw retryError;
      }
      // MySQL's message stays in the cause for the logs and never reaches the client.
      throw new UnprocessableEntityException(
        { errorCode: SQL_ERROR_CODE.FAILED, message: 'The generated query failed twice' },
        { cause: retryError },
      );
    }
  }

  /** Runs validated SQL and reads its rows as the answer its shape says they are. */
  private async answer(generation: ValidGeneration, corrected: boolean): Promise<SqlQueryResult> {
    const rows = await this.executor.execute(generation.sql);
    return {
      status: 'answered',
      sql: generation.sql,
      answer: toSqlAnswer(generation.shape, rows),
      corrected,
    };
  }

  /**
   * The outcome when no SQL ran. The validator's detail goes to the log rather
   * than the response, since it can quote the model's own text.
   */
  private withoutRows(generation: Exclude<SqlGenerationResult, ValidGeneration>): SqlQueryResult {
    if (generation.status === 'declined') {
      return { status: 'declined' };
    }
    this.logger.warn(
      'Generated SQL was rejected by the validator',
      { reason: generation.reason, detail: generation.detail },
      SqlQueryService.name,
    );
    return { status: 'rejected', reason: generation.reason, detail: generation.detail };
  }
}
