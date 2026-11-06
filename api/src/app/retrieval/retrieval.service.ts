import { performance } from 'node:perf_hooks';
import { Injectable } from '@nestjs/common';
import type { SearchResult, SemanticSearchRequest } from '../../contracts/index.js';
import { KeywordSearchService } from './keyword-search.service.js';
import { SemanticSearchService } from './semantic-search.service.js';

/** Both rankings for one query, each best first with its own scores, and where the time went. */
export interface RankedLists {
  readonly knn: SearchResult[];
  readonly bm25: SearchResult[];
  readonly timing: {
    /** Embedding the query plus the kNN search. */
    readonly knnMs: number;
    readonly bm25Ms: number;
    readonly totalMs: number;
  };
}

/**
 * Runs kNN and BM25 for one query under the same filters, side by side, so
 * the keyword search never waits on the embedding call. The lists come back
 * apart: fusing them is a separate step, and the under the hood view shows each.
 */
@Injectable()
export class RetrievalService {
  public constructor(
    private readonly semantic: SemanticSearchService,
    private readonly keyword: KeywordSearchService,
  ) {}

  /** The kNN and BM25 rankings of the `topK` best matches, under the request's filters. */
  public async rankedLists(request: SemanticSearchRequest): Promise<RankedLists> {
    const startedAt = performance.now();
    const [knn, bm25] = await Promise.all([
      this.semantic.search(request),
      this.keyword.search(request),
    ]);
    return {
      knn: knn.results,
      bm25: bm25.results,
      timing: {
        knnMs: knn.timing.totalMs,
        bm25Ms: bm25.timing.searchMs,
        totalMs: Math.round(performance.now() - startedAt),
      },
    };
  }
}
