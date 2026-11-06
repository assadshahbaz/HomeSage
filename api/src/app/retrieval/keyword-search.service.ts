import { performance } from 'node:perf_hooks';
import type { Client } from '@elastic/elasticsearch';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SearchResult, SemanticSearchRequest } from '../../contracts/index.js';
import type { ElasticsearchConfig } from '../../infra/config/elasticsearch.config.js';
import { ELASTICSEARCH_CLIENT } from '../../infra/elasticsearch/elasticsearch.symbol.js';
import { AppLogger } from '../../platform/logging/app-logger.js';
import { keywordQuery } from './query/keyword-query.js';
import { toSearchResult } from './results/search-hit.js';
import { isSearchUnavailable } from './results/search-unavailable.js';

/** What a keyword search found, and how long it took in whole milliseconds. */
export interface KeywordSearchOutcome {
  readonly results: SearchResult[];
  readonly timing: { readonly searchMs: number };
}

/**
 * The keyword half of retrieval: BM25 over each property's paragraph, so an
 * exact word such as a street name or "bungalow" is found even when the vector
 * misses it. Filters are applied inside the search, as for kNN. An index that
 * cannot answer is a 503.
 */
@Injectable()
export class KeywordSearchService {
  private readonly indexName: string;

  public constructor(
    @Inject(ELASTICSEARCH_CLIENT) private readonly client: Client,
    private readonly logger: AppLogger,
    configService: ConfigService,
  ) {
    this.indexName = configService.getOrThrow<ElasticsearchConfig>('elasticsearch').index;
  }

  /** The `topK` properties whose paragraph best matches the query's words and its filters, best first. */
  public async search(request: SemanticSearchRequest): Promise<KeywordSearchOutcome> {
    const startedAt = performance.now();
    const hits = await this.matching(request);
    const outcome = {
      results: hits.map(toSearchResult),
      timing: { searchMs: Math.round(performance.now() - startedAt) },
    };
    // Never the query text: it may say something about the person asking.
    this.logger.log(
      'keyword search',
      {
        results: outcome.results.length,
        topK: request.topK,
        filters: Object.keys(request.filters),
        ...outcome.timing,
      },
      KeywordSearchService.name,
    );
    return outcome;
  }

  private async matching(request: SemanticSearchRequest): Promise<unknown[]> {
    try {
      const response = await this.client.search({
        index: this.indexName,
        ...keywordQuery(request.query, request.topK, request.filters),
      });
      return response.hits.hits;
    } catch (error) {
      if (isSearchUnavailable(error)) {
        throw new ServiceUnavailableException('Search is unavailable', { cause: error });
      }
      throw error;
    }
  }
}
