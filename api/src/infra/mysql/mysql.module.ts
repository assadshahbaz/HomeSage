import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type mysql from 'mysql2/promise';
import type { MysqlConfig } from '../config/mysql.config.js';
import { createMysqlPool } from './mysql-pool.js';
import { MysqlHealthIndicator } from './mysql.health-indicator.js';
import { MysqlService } from './mysql.service.js';
import { MYSQL_POOL } from './mysql.symbol.js';

@Global()
@Module({
  providers: [
    {
      provide: MYSQL_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): mysql.Pool =>
        createMysqlPool(configService.getOrThrow<MysqlConfig>('mysql')),
    },
    MysqlService,
    MysqlHealthIndicator,
  ],
  exports: [MysqlService, MysqlHealthIndicator],
})
export class MysqlModule implements OnApplicationShutdown {
  public constructor(@Inject(MYSQL_POOL) private readonly pool: mysql.Pool) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
