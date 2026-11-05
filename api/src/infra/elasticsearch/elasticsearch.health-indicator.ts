import { Inject, Injectable } from '@nestjs/common';
import type { Client } from '@elastic/elasticsearch';
import type { HealthIndicator } from '../../core/health-indicator.js';
import { ELASTICSEARCH_CLIENT } from './elasticsearch.symbol.js';

/** Answers whether the search index is reachable. */
@Injectable()
export class ElasticsearchHealthIndicator implements HealthIndicator {
  public readonly name = 'elasticsearch';

  public constructor(@Inject(ELASTICSEARCH_CLIENT) private readonly client: Client) {}

  public async ping(): Promise<void> {
    await this.client.ping();
  }
}
