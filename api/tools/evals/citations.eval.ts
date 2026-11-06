import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module.ts';
import { GuardedAnswer } from '../../src/app/chat/answer/guarded-answer.ts';
import { HybridRetrievalService } from '../../src/app/retrieval/hybrid-retrieval.service.ts';
import { QueryRouter } from '../../src/app/router/query-router.ts';
import { CHAT_INTENT } from '../../src/contracts/index.ts';
import type { LlmConfig } from '../../src/infra/config/llm.config.ts';
import { AppLogger } from '../../src/platform/logging/app-logger.ts';
import { reportPath } from './eval-data.ts';
import { loadGoldenSet } from './golden-set.ts';
import { idsOutside, renderCitationsReport } from './render-citations-report.ts';
import type { CitationResult } from './render-citations-report.ts';
import { extractSection, NARRATIVE_HEADING } from './render-semantic-report.ts';

const REPORT_FILE = 'm3-citations.md';
// About thirty questions, each up to three model calls, paced for a free tier.
const RUN_TIMEOUT_MS = 3_600_000;
// A router, SQL and answer call together come to about 10,000 tokens, over a
// free tier's 8,000 a minute per model, so questions are a minute apart.
// Override with EVAL_PACE_MS.
const DEFAULT_PACE_MS = 60_000;

describe('M3 citations eval', () => {
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
    'answers every golden question through the guard, and writes the report',
    async () => {
      const startedAt = Date.now();
      const llm = app.get(ConfigService).getOrThrow<LlmConfig>('llm');
      const router = app.get(QueryRouter);
      const retrieval = app.get(HybridRetrievalService);
      const answer = app.get(GuardedAnswer);
      const paceMs = Number(process.env['EVAL_PACE_MS'] ?? DEFAULT_PACE_MS);

      const results: CitationResult[] = [];
      for (const [index, entry] of loadGoldenSet().entries()) {
        if (index > 0) {
          await sleep(paceMs);
        }
        const route = await router.route(entry.question);
        const base = { id: entry.id, question: entry.question, intent: route.intent };
        if (route.intent === CHAT_INTENT.OUT_OF_SCOPE) {
          results.push({
            ...base,
            declined: true,
            contextIds: [],
            aggregate: false,
            citedIds: [],
            citedSql: false,
            stripped: [],
            leakedIds: [],
            streamMatches: true,
          });
          continue;
        }

        const found = await retrieval.retrieve(route);
        const contextIds = found.properties.map((property) => property.property.id);
        let streamed = '';
        for await (const event of answer.stream(route.standaloneQuestion, found)) {
          if (event.kind === 'text') {
            streamed += event.text;
            continue;
          }
          const { citations } = event;
          results.push({
            ...base,
            declined: false,
            contextIds,
            aggregate: found.sql?.aggregate != null,
            citedIds: citations.kind === 'properties' ? citations.ids : [],
            citedSql: citations.kind === 'aggregate',
            stripped: event.stripped.map((marker) => `${marker.marker} ${marker.reason}`),
            leakedIds: idsOutside(streamed, contextIds),
            streamMatches: streamed === event.text,
          });
        }
      }

      const path = reportPath(REPORT_FILE);
      const narrative = existsSync(path)
        ? extractSection(readFileSync(path, 'utf8'), NARRATIVE_HEADING)
        : null;
      writeFileSync(
        path,
        renderCitationsReport({
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          provider: llm.provider,
          answerModel: llm.answer.model,
          results,
          narrative,
        }),
      );

      expect(results.filter((result) => result.leakedIds.length > 0)).toEqual([]);
    },
    RUN_TIMEOUT_MS,
  );
});
