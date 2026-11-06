import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RowDataPacket } from 'mysql2/promise';
import type { SqlConfig } from '../../../infra/config/sql.config.js';
import { MysqlService } from '../../../infra/mysql/mysql.service.js';
import { sqlRowSchema } from '../../../contracts/index.js';
import type { SqlRow } from '../../../contracts/index.js';
import type { ValidatedSql } from '../validation/sql-validation-result.js';

/**
 * Runs validated SQL on the read only connection, stopped by MySQL after the
 * configured statement timeout. It takes only `ValidatedSql`, so model output
 * that skipped the validator does not compile as an argument.
 */
@Injectable()
export class SqlExecutor {
  private readonly timeoutMs: number;

  public constructor(
    private readonly mysql: MysqlService,
    configService: ConfigService,
  ) {
    this.timeoutMs = configService.getOrThrow<SqlConfig>('sql').statementTimeoutMs;
  }

  /**
   * Runs one query. Values from structured filters travel as bound `params`,
   * never inside the SQL text. The rows are checked at the boundary, since
   * their shape is whatever the model wrote.
   */
  public async execute(sql: ValidatedSql, params: readonly unknown[] = []): Promise<SqlRow[]> {
    const rows = await this.mysql.queryWithTimeout<RowDataPacket>(sql, [...params], this.timeoutMs);
    return sqlRowSchema.array().parse(rows);
  }
}
