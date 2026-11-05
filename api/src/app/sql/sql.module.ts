import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SqlConfig } from '../../infra/config/sql.config.js';
import { LlmModule } from '../llm/llm.module.js';
import { SqlExecutor } from './execution/sql-executor.js';
import { SqlGenerator } from './generation/sql-generator.js';
import { SqlQueryService } from './sql-query.service.js';
import { SqlValidator } from './validation/sql-validator.js';
import { SqlController } from './sql.controller.js';

@Module({
  imports: [LlmModule],
  controllers: [SqlController],
  providers: [
    {
      provide: SqlValidator,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): SqlValidator =>
        new SqlValidator(configService.getOrThrow<SqlConfig>('sql').rowLimit),
    },
    SqlGenerator,
    SqlExecutor,
    SqlQueryService,
  ],
  exports: [SqlQueryService],
})
export class SqlModule {}
