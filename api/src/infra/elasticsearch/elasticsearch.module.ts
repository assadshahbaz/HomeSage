import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import type { ElasticsearchConfig } from '../config/elasticsearch.config.js';
import { ElasticsearchHealthIndicator } from './elasticsearch.health-indicator.js';
import { ELASTICSEARCH_CLIENT } from './elasticsearch.symbol.js';

@Global()
@Module({
  providers: [
    {
      provide: ELASTICSEARCH_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Client => {
        const { url, requestTimeoutMs } =
          configService.getOrThrow<ElasticsearchConfig>('elasticsearch');

        return new Client({ node: url, requestTimeout: requestTimeoutMs });
      },
    },
    ElasticsearchHealthIndicator,
  ],
  exports: [ELASTICSEARCH_CLIENT, ElasticsearchHealthIndicator],
})
export class ElasticsearchModule implements OnApplicationShutdown {
  public constructor(@Inject(ELASTICSEARCH_CLIENT) private readonly client: Client) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
