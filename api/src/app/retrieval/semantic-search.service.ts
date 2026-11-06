import { performance } from 'node:perf_hooks';
import type { Client } from '@elastic/elasticsearch';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { SearchResult, SemanticSearchRequest } from '../../contracts/index.js';
import type { ElasticsearchConfig } from '../../infra/config/elasticsearch.config.js';
import { ELASTICSEARCH_CLIENT } from '../../infra/elasticsearch/elasticsearch.symbol.js';
import { AppLogger } from '../../platform/logging/app-logger.js';
import { EmbeddingService } from '../embeddings/embedding.service.js';
import { semanticQuery } from './query/semantic-query.js';
import { toSearchResult } from './results/search-hit.js';
import { isSearchUnavailable } from './results/search-unavailable.js';

// Widened on purpose, as in the exception filter: statuses here are plain numbers.
const SERVER_ERROR_FLOOR: number = HttpStatus.INTERNAL_SERVER_ERROR;

const statusSchema = z.object({ status: z.number() });

/** What a search found, and where its time went, in whole milliseconds. */
export interface SemanticSearchOutcome {
  readonly results: SearchResult[];
  readonly timing: {
    readonly embedMs: number;
    readonly searchMs: number;
    readonly totalMs: number;
  };
}

/**
 * The semantic half of retrieval: embeds the query with the model's query side
 * and runs kNN over the property index, with every filter applied inside the
 * search. A backing service that cannot answer, the index or the embedding
 * model, is a 503; the embedding service's own deadline stays a 504.
 */
@Injectable()
export class SemanticSearchService {
  private readonly indexName: string;

  public constructor(
    private readonly embeddings: EmbeddingService,
    @Inject(ELASTICSEARCH_CLIENT) private readonly client: Client,
    private readonly logger: AppLogger,
    configService: ConfigService,
  ) {
    this.indexName = configService.getOrThrow<ElasticsearchConfig>('elasticsearch').index;
  }

  /** The `topK` properties nearest the query that match its filters, nearest first. */
  public async search(request: SemanticSearchRequest): Promise<SemanticSearchOutcome> {
    const startedAt = performance.now();
    const vector = await this.embed(request.query);
    const embeddedAt = performance.now();
    const hits = await this.nearest(vector, request);
    const finishedAt = performance.now();

    const outcome = {
      results: hits.map(toSearchResult),
      timing: {
        embedMs: Math.round(embeddedAt - startedAt),
        searchMs: Math.round(finishedAt - embeddedAt),
        totalMs: Math.round(finishedAt - startedAt),
      },
    };
    // Never the query text: it may say something about the person asking.
    this.logger.log(
      'semantic search',
      {
        results: outcome.results.length,
        topK: request.topK,
        filters: Object.keys(request.filters),
        ...outcome.timing,
      },
      SemanticSearchService.name,
    );
    return outcome;
  }

  private async embed(query: string): Promise<readonly number[]> {
    try {
      return (await this.embeddings.embedQuery(query)).vector;
    } catch (error) {
      if (isUnreachable(error)) {
        throw new ServiceUnavailableException('The embedding model is unavailable', {
          cause: error,
        });
      }
      throw error;
    }
  }

  private async nearest(
    vector: readonly number[],
    request: SemanticSearchRequest,
  ): Promise<unknown[]> {
    try {
      const response = await this.client.search({
        index: this.indexName,
        ...semanticQuery(vector, request.topK, request.filters),
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

/**
 * The embedding model could not be reached or failed on its side: a refused or
 * dropped connection is a `TypeError` from fetch, and a vendor error may carry
 * a 5xx status. Anything else, such as a bad request, is a bug and stays a 500.
 * An HTTP exception, such as the embedding service's own 504, is already an
 * answer and passes through, though it too carries a status.
 */
function isUnreachable(error: unknown): boolean {
  if (error instanceof HttpException) {
    return false;
  }
  if (error instanceof TypeError) {
    return true;
  }
  const parsed = statusSchema.safeParse(error);
  return parsed.success && parsed.data.status >= SERVER_ERROR_FLOOR;
}
