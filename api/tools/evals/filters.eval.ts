import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module.ts';
import { HybridRetrievalService } from '../../src/app/retrieval/hybrid-retrieval.service.ts';
import { PropertyCardReader } from '../../src/app/retrieval/properties/property-card-reader.ts';
import { filterViolations } from '../../src/app/retrieval/query/filter-violations.ts';
import { QueryRouter } from '../../src/app/router/query-router.ts';
import { CHAT_INTENT, PROPERTY_KIND } from '../../src/contracts/index.ts';
import type { LlmConfig } from '../../src/infra/config/llm.config.ts';
import { AppLogger } from '../../src/platform/logging/app-logger.ts';
import { loadRouterCases, reportPath } from './eval-data.ts';
import { GOLDEN_SLICE, loadGoldenSet } from './golden-set.ts';
import { renderFiltersReport } from './render-filters-report.ts';
import type { FilterResult } from './render-filters-report.ts';
import { extractSection, NARRATIVE_HEADING } from './render-semantic-report.ts';

const REPORT_FILE = 'm3-filters.md';
// Twenty questions, each a router call and maybe a SQL call, paced for a free tier.
const RUN_TIMEOUT_MS = 3_600_000;
// A router call and a SQL call are about 6,000 tokens and a free tier allows
// 8,000 a minute per model, so questions are 45 seconds apart. Override with EVAL_PACE_MS.
const DEFAULT_PACE_MS = 45_000;
const HYBRID_CASE_CATEGORY = 'hybrid';

describe('M3 filters eval', () => {
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
    'returns no property outside the router filters, and writes the report',
    async () => {
      const startedAt = Date.now();
      const llm = app.get(ConfigService).getOrThrow<LlmConfig>('llm');
      const router = app.get(QueryRouter);
      const retrieval = app.get(HybridRetrievalService);
      const cards = app.get(PropertyCardReader);
      const paceMs = Number(process.env['EVAL_PACE_MS'] ?? DEFAULT_PACE_MS);

      const questions = [
        ...loadRouterCases()
          .filter((routerCase) => routerCase.category === HYBRID_CASE_CATEGORY)
          .map((routerCase) => ({ question: routerCase.question, source: 'cases: hybrid' })),
        ...loadGoldenSet()
          .filter((entry) => entry.slice === GOLDEN_SLICE.STRUCTURED_FILTERS)
          .map((entry) => ({ question: entry.question, source: `golden: ${entry.slice}` })),
      ];

      const results: FilterResult[] = [];
      for (const [index, { question, source }] of questions.entries()) {
        if (index > 0) {
          await sleep(paceMs);
        }
        const route = await router.route(question);
        const set = Object.entries(route.filters)
          .filter(
            ([name, value]) =>
              !(
                name === 'propertyKinds' &&
                Array.isArray(value) &&
                value.length === 1 &&
                value[0] === PROPERTY_KIND.RESIDENTIAL
              ),
          )
          .map(([name]) => name);
        const routed = { intent: route.intent, fallback: route.fallback };
        if (route.intent === CHAT_INTENT.OUT_OF_SCOPE) {
          results.push({
            question,
            source,
            ...routed,
            failures: [],
            filters: set,
            returned: 0,
            caught: [],
            leaked: [],
          });
          continue;
        }

        const found = await retrieval.retrieve(route);
        // Read again, apart from retrieval, so the check does not trust the code it checks.
        const reread = await cards.read(found.properties.map((property) => property.property.id));
        const leaked = reread.flatMap(({ card, kind }) => {
          const failed = filterViolations(card, kind, route.filters);
          return failed.length === 0 ? [] : [`${card.id}: ${failed.join(', ')}`];
        });
        results.push({
          question,
          source,
          ...routed,
          failures: found.failures.map((failure) => `${failure.branch}: ${failure.reason}`),
          filters: set,
          returned: found.properties.length,
          caught: found.violations.map((violation) => {
            const branches = Object.entries(violation.placements)
              .filter(([, placement]) => placement !== null)
              .map(([branch]) => branch)
              .join('+');
            return `${violation.id} ${branches}: ${violation.filters.join(', ')}`;
          }),
          leaked,
        });
      }

      const path = reportPath(REPORT_FILE);
      const narrative = existsSync(path)
        ? extractSection(readFileSync(path, 'utf8'), NARRATIVE_HEADING)
        : null;
      writeFileSync(
        path,
        renderFiltersReport({
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          provider: llm.provider,
          routerModel: llm.router.model,
          sqlModel: llm.answer.model,
          results,
          narrative,
        }),
      );

      expect(results.flatMap((result) => result.leaked)).toEqual([]);
    },
    RUN_TIMEOUT_MS,
  );
});
