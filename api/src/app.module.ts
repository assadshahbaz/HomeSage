import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './infra/config/app.config.js';
import { mysqlConfig } from './infra/config/mysql.config.js';
import { elasticsearchConfig } from './infra/config/elasticsearch.config.js';
import { redisConfig } from './infra/config/redis.config.js';
import { retrievalConfig } from './infra/config/retrieval.config.js';
import { llmConfig } from './infra/config/llm.config.js';
import { embeddingsConfig } from './infra/config/embeddings.config.js';
import { sqlConfig } from './infra/config/sql.config.js';
import { throttleConfig } from './infra/config/throttle.config.js';
import { validateEnv } from './infra/config/env.validation.js';
import { MysqlModule } from './infra/mysql/mysql.module.js';
import { ElasticsearchModule } from './infra/elasticsearch/elasticsearch.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { RequestContextModule } from './platform/request-context/request-context.module.js';
import { LoggingModule } from './platform/logging/logging.module.js';
import { ThrottlerModule } from './platform/throttler/throttler.module.js';
import { HealthModule } from './app/health/health.module.js';
import { LlmModule } from './app/llm/llm.module.js';
import { SqlModule } from './app/sql/sql.module.js';
import { EmbeddingsModule } from './app/embeddings/embeddings.module.js';
import { IngestionModule } from './app/ingestion/ingestion.module.js';
import { ChatModule } from './app/chat/chat.module.js';
import { RetrievalModule } from './app/retrieval/retrieval.module.js';
import { RouterModule } from './app/router/router.module.js';

// One .env at the repo root serves Docker Compose and both apps, so the API
// reads it from a folder above its own.
const ENV_FILE_PATH = '../.env';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ENV_FILE_PATH,
      isGlobal: true,
      load: [
        appConfig,
        mysqlConfig,
        elasticsearchConfig,
        redisConfig,
        llmConfig,
        embeddingsConfig,
        sqlConfig,
        retrievalConfig,
        throttleConfig,
      ],
      validate: validateEnv,
    }),
    RequestContextModule,
    LoggingModule,
    ThrottlerModule,
    MysqlModule,
    ElasticsearchModule,
    RedisModule,
    HealthModule,
    LlmModule,
    SqlModule,
    EmbeddingsModule,
    IngestionModule,
    RetrievalModule,
    RouterModule,
    ChatModule,
  ],
})
export class AppModule {}
