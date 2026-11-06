import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module.ts';
import { RetrievalService } from '../../src/app/retrieval/retrieval.service.ts';
import { SEARCH_TOP_K_DEFAULT, semanticSearchRequestSchema } from '../../src/contracts/index.ts';
import type { ElasticsearchConfig } from '../../src/infra/config/elasticsearch.config.ts';
import type { EmbeddingsConfig } from '../../src/infra/config/embeddings.config.ts';
import { AppLogger } from '../../src/platform/logging/app-logger.ts';
import { reportPath } from './eval-data.ts';
import { loadGoldenSet, requireRelevanceScored, selectEntries } from './golden-set.ts';
import { renderRankedListsReport } from './render-ranked-lists-report.ts';
import type { RankedListsQuestionResult } from './render-ranked-lists-report.ts';
import { extractSection, NARRATIVE_HEADING } from './render-semantic-report.ts';
import { scoreRecall, scoreRecallOfEither } from './score-recall.ts';
import { SEMANTIC_SELECTION } from './semantic-selection.ts';

const REPORT_FILE = 'm3-ranked-lists.md';
// Ten questions against a local index and a local embedding model.
const RUN_TIMEOUT_MS = 300_000;

describe('M3 ranked lists eval', () => {
  let app: INestApplicationContext;

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const logger = app.get(AppLogger);
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(logger, level).mockImplementation(() => undefined);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it(
    'scores kNN, BM25 and both together on the semantic slice, and writes the report',
    async () => {
      const startedAt = Date.now();
      const config = app.get(ConfigService);
      const retrieval = app.get(RetrievalService);

      // The same questions the M2 report scores kNN on, so its number is the before.
      const entries = requireRelevanceScored(selectEntries(loadGoldenSet(), SEMANTIC_SELECTION));
      if (entries.length === 0) {
        throw new Error('the semantic selection picked no golden set entries');
      }
      const questions: RankedListsQuestionResult[] = [];
      for (const entry of entries) {
        const lists = await retrieval.rankedLists(
          semanticSearchRequestSchema.parse({ query: entry.question, topK: SEARCH_TOP_K_DEFAULT }),
        );
        const knn = lists.knn.map((result) => Number(result.id));
        const bm25 = lists.bm25.map((result) => Number(result.id));
        const { ids, uncertainIds = [] } = entry.expected;
        questions.push({
          id: entry.id,
          question: entry.question,
          knn: scoreRecall(knn, ids, uncertainIds, SEARCH_TOP_K_DEFAULT),
          bm25: scoreRecall(bm25, ids, uncertainIds, SEARCH_TOP_K_DEFAULT),
          either: scoreRecallOfEither(knn, bm25, ids, uncertainIds, SEARCH_TOP_K_DEFAULT),
        });
      }

      const path = reportPath(REPORT_FILE);
      const narrative = existsSync(path)
        ? extractSection(readFileSync(path, 'utf8'), NARRATIVE_HEADING)
        : null;
      writeFileSync(
        path,
        renderRankedListsReport({
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          embeddingModel: config.getOrThrow<EmbeddingsConfig>('embeddings').model,
          index: config.getOrThrow<ElasticsearchConfig>('elasticsearch').index,
          topK: SEARCH_TOP_K_DEFAULT,
          questions,
          narrative,
        }),
      );
    },
    RUN_TIMEOUT_MS,
  );
});
