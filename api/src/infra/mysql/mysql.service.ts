import { Inject, Injectable } from '@nestjs/common';
import type mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
import { MYSQL_POOL } from './mysql.symbol.js';

/**
 * The only way into MySQL. The pool behind it holds the read only account, so a
 * write is refused by the database itself rather than by application code.
 */
@Injectable()
export class MysqlService {
  public constructor(@Inject(MYSQL_POOL) private readonly pool: mysql.Pool) {}

  /** Runs a single statement with bound parameters and returns the rows. */
  public async query<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.pool.query<T[]>(sql, params);
    return rows;
  }

  /**
   * Runs a single SELECT that MySQL itself stops after `timeoutMs`. The limit
   * is set on the session of one pooled connection and put back before the
   * connection returns to the pool, so no other query inherits it. A
   * connection whose reset fails is destroyed rather than reused.
   */
  public async queryWithTimeout<T extends RowDataPacket>(
    sql: string,
    params: unknown[],
    timeoutMs: number,
  ): Promise<T[]> {
    const connection = await this.pool.getConnection();
    let reusable = false;
    try {
      await connection.query('SET SESSION max_execution_time = ?', [timeoutMs]);
      try {
        const [rows] = await connection.query<T[]>(sql, params);
        return rows;
      } finally {
        await connection.query('SET SESSION max_execution_time = DEFAULT');
        reusable = true;
      }
    } finally {
      if (reusable) {
        connection.release();
      } else {
        connection.destroy();
      }
    }
  }
}
