import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { IngestionService } from './ingestion.service.js';
import { IngestionRunState } from './run-state/ingestion-run-state.js';
import { PropertyIndex } from './search-index/property-index.js';
import { PropertyReader } from './source/property-reader.js';

/** Turns MySQL rows into the property search index. */
@Module({
  imports: [EmbeddingsModule],
  providers: [PropertyIndex, PropertyReader, IngestionRunState, IngestionService],
  exports: [PropertyIndex, IngestionService],
})
export class IngestionModule {}
