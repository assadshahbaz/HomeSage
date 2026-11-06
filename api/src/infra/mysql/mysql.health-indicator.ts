import { Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import type { HealthIndicator } from '../../core/health-indicator.js';
import { MysqlService } from './mysql.service.js';

/** Answers whether the read only pool can still reach MySQL. */
@Injectable()
export class MysqlHealthIndicator implements HealthIndicator {
  public readonly name = 'mysql';

  public constructor(private readonly mysql: MysqlService) {}

  public async ping(): Promise<void> {
    await this.mysql.query<RowDataPacket>('SELECT 1');
  }
}
