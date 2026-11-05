import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { SqlModule } from '../sql/sql.module.js';
import { HybridRetrievalService } from './hybrid-retrieval.service.js';
import { KeywordSearchService } from './keyword-search.service.js';
import { PropertyCardReader } from './properties/property-card-reader.js';
import { PropertyDisclosureReader } from './properties/property-disclosure-reader.js';
import { RetrievalService } from './retrieval.service.js';
import { SearchController } from './search.controller.js';
import { SemanticSearchService } from './semantic-search.service.js';

/**
 * Finds properties in the search index by meaning (kNN) and by words (BM25),
 * and fuses those with the SQL path's rows for a routed question.
 */
@Module({
  imports: [EmbeddingsModule, SqlModule],
  controllers: [SearchController],
  providers: [
    SemanticSearchService,
    KeywordSearchService,
    RetrievalService,
    PropertyCardReader,
    PropertyDisclosureReader,
    HybridRetrievalService,
  ],
  exports: [SemanticSearchService, RetrievalService, HybridRetrievalService],
})
export class RetrievalModule {}
