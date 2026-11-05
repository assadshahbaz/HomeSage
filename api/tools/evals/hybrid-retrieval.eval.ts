import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module.ts';
import { HybridRetrievalService } from '../../src/app/retrieval/hybrid-retrieval.service.ts';
import { QueryRouter } from '../../src/app/router/query-router.ts';
import {
  CHAT_INTENT,
  CHAT_PROPERTIES_MAX,
  searchFiltersSchema,
} from '../../src/contracts/index.ts';
import type { EmbeddingsConfig } from '../../src/infra/config/embeddings.config.ts';
import type { LlmConfig } from '../../src/infra/config/llm.config.ts';
import type { RetrievalConfig } from '../../src/infra/config/retrieval.config.ts';
import { AppLogger } from '../../src/platform/logging/app-logger.ts';
import { loadRouterCases, reportPath } from './eval-data.ts';
import { loadGoldenSet, requireRelevanceScored, selectEntries } from './golden-set.ts';
import { renderHybridRetrievalReport } from './render-hybrid-retrieval-report.ts';
import type { FusedRecallResult, HybridCaseResult } from './render-hybrid-retrieval-report.ts';
import { extractSection, NARRATIVE_HEADING } from './render-semantic-report.ts';
import { scoreRecall } from './score-recall.ts';
import { SEMANTIC_SELECTION } from './semantic-selection.ts';

const REPORT_FILE = 'm3-hybrid-retrieval.md';
// Eight hybrid questions, each a router call and a SQL call, paced for a free tier.
const RUN_TIMEOUT_MS = 1_800_000;
// A router call and a SQL call are about 6,000 tokens and a free tier allows
// 8,000 a minute per model, so questions are 45 seconds apart. Override with EVAL_PACE_MS.
const DEFAULT_PACE_MS = 45_000;
const HYBRID_CASE_CATEGORY = 'hybrid';

describe('M3 hybrid retrieval eval', () => {
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
    'scores fused recall on the semantic slice, runs the hybrid cases, and writes the report',
    async () => {
      const startedAt = Date.now();
      const config = app.get(ConfigService);
      const llm = config.getOrThrow<LlmConfig>('llm');
      const retrieval = app.get(HybridRetrievalService);
      const router = app.get(QueryRouter);
      const paceMs = Number(process.env['EVAL_PACE_MS'] ?? DEFAULT_PACE_MS);

      // The same questions the M2 and ranked lists reports score, routed as semantic
      // by hand, so no model call decides what is measured.
      const entries = requireRelevanceScored(selectEntries(loadGoldenSet(), SEMANTIC_SELECTION));
      const semantic: FusedRecallResult[] = [];
      for (const entry of entries) {
        const found = await retrieval.retrieve({
          intent: CHAT_INTENT.SEMANTIC,
          filters: searchFiltersSchema.parse({}),
          semanticQuery: entry.question,
          standaloneQuestion: entry.question,
          propertyIds: [],
          fallback: null,
        });
        const ranking = found.properties.map((entry) => Number(entry.property.id));
        semantic.push({
          question: entry.question,
          fused: scoreRecall(
            ranking,
            entry.expected.ids,
            entry.expected.uncertainIds ?? [],
            CHAT_PROPERTIES_MAX,
          ),
        });
      }

      const cases = loadRouterCases().filter(
        (routerCase) => routerCase.category === HYBRID_CASE_CATEGORY,
      );
      const hybrid: HybridCaseResult[] = [];
      for (const [index, routerCase] of cases.entries()) {
        if (index > 0) {
          await sleep(paceMs);
        }
        const route = await router.route(routerCase.question);
        const found = await retrieval.retrieve(route);
        const placed = (branch: 'sql' | 'knn' | 'bm25'): number =>
          found.properties.filter((entry) => entry.placements[branch] !== null).length;
        hybrid.push({
          question: routerCase.question,
          intent: route.intent,
          properties: found.properties.length,
          unique: new Set(found.properties.map((entry) => entry.property.id)).size,
          fromSql: placed('sql'),
          fromKnn: placed('knn'),
          fromBm25: placed('bm25'),
          failures: found.failures.map((failure) => `${failure.branch}: ${failure.reason}`),
          totalMs: found.timing.totalMs,
        });
      }

      const path = reportPath(REPORT_FILE);
      const narrative = existsSync(path)
        ? extractSection(readFileSync(path, 'utf8'), NARRATIVE_HEADING)
        : null;
      writeFileSync(
        path,
        renderHybridRetrievalReport({
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          provider: llm.provider,
          routerModel: llm.router.model,
          sqlModel: llm.answer.model,
          embeddingModel: config.getOrThrow<EmbeddingsConfig>('embeddings').model,
          branchTimeoutMs: config.getOrThrow<RetrievalConfig>('retrieval').branchTimeoutMs,
          topK: CHAT_PROPERTIES_MAX,
          semantic,
          hybrid,
          narrative,
        }),
      );

      expect(hybrid).toHaveLength(cases.length);
    },
    RUN_TIMEOUT_MS,
  );
});
