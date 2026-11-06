import { Module } from '@nestjs/common';
import type { HealthIndicator } from '../../core/health-indicator.js';
import { ElasticsearchHealthIndicator } from '../../infra/elasticsearch/elasticsearch.health-indicator.js';
import { MysqlHealthIndicator } from '../../infra/mysql/mysql.health-indicator.js';
import { RedisHealthIndicator } from '../../infra/redis/redis.health-indicator.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { HEALTH_INDICATORS } from './health.symbol.js';

/**
 * The one place that knows which services `/health` covers. An adapter without
 * an indicator listed here is missing from the endpoint.
 */
@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: HEALTH_INDICATORS,
      inject: [MysqlHealthIndicator, ElasticsearchHealthIndicator, RedisHealthIndicator],
      useFactory: (
        mysql: MysqlHealthIndicator,
        elasticsearch: ElasticsearchHealthIndicator,
        redis: RedisHealthIndicator,
      ): readonly HealthIndicator[] => [mysql, elasticsearch, redis],
    },
    HealthService,
  ],
})
export class HealthModule {}
