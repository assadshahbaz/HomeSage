import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { QueryRouter } from './query-router.js';
import { FilterVocabulary } from './vocabulary/filter-vocabulary.js';

/** Decides what a question needs: SQL, a meaning search, both, or a polite decline. */
@Module({
  imports: [LlmModule],
  providers: [FilterVocabulary, QueryRouter],
  exports: [QueryRouter],
})
export class RouterModule {}
