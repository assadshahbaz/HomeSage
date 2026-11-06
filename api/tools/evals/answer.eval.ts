import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module.ts';
import { AnswerGenerator } from '../../src/app/chat/answer/answer-generator.ts';
import { citedPropertyIds } from '../../src/app/chat/answer/cited-ids.ts';
import { HybridRetrievalService } from '../../src/app/retrieval/hybrid-retrieval.service.ts';
import { QueryRouter } from '../../src/app/router/query-router.ts';
import type { Route } from '../../src/app/router/route.ts';
import { CHAT_INTENT, searchFiltersSchema } from '../../src/contracts/index.ts';
import type { LlmConfig } from '../../src/infra/config/llm.config.ts';
import { AppLogger } from '../../src/platform/logging/app-logger.ts';
import { loadRouterCases, reportPath } from './eval-data.ts';
import { loadGoldenSet } from './golden-set.ts';
import { renderAnswerReport } from './render-answer-report.ts';
import type { AnswerResult } from './render-answer-report.ts';
import { extractSection, NARRATIVE_HEADING } from './render-semantic-report.ts';

const REPORT_FILE = 'm3-answers.md';
const PROMPT = 'answer.v1';
// Four questions, each up to three model calls, paced for a free tier.
const RUN_TIMEOUT_MS = 900_000;
// A router, SQL and answer call together come to about 10,000 tokens, over a
// free tier's 8,000 a minute per model, so questions are a minute apart.
// Override with EVAL_PACE_MS.
const DEFAULT_PACE_MS = 60_000;

/** A question, and whether the router reads it or the route is set by hand. */
interface AnswerQuestion {
  readonly label: string;
  readonly question: string;
  /** Set to skip the router, so the answer prompt itself is what declines. */
  readonly route?: Route;
}

function goldenQuestion(id: string): string {
  const entry = loadGoldenSet().find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`No golden set entry ${id}`);
  }
  return entry.question;
}

function routerCaseQuestion(id: string): string {
  const routerCase = loadRouterCases().find((candidate) => candidate.id === id);
  if (!routerCase) {
    throw new Error(`No router case ${id}`);
  }
  return routerCase.question;
}

function questions(): AnswerQuestion[] {
  const epc = goldenQuestion('decline-epc-rating');
  return [
    { label: 'structured', question: goldenQuestion('inverurie-asbestos') },
    { label: 'semantic', question: goldenQuestion('cosy-flat-garden-quiet-street') },
    { label: 'hybrid', question: routerCaseQuestion('quiet-family-home-inverurie') },
    {
      label: 'EPC rating, router skipped',
      question: epc,
      // The router declines this before retrieval. Sending it on as hybrid
      // shows the answer prompt declines it on its own too.
      route: {
        intent: CHAT_INTENT.HYBRID,
        filters: searchFiltersSchema.parse({ towns: ['Aberdeen'] }),
        semanticQuery: 'a home with a good energy rating',
        standaloneQuestion: epc,
        propertyIds: [],
        fallback: null,
      },
    },
  ];
}

describe('M3 answer eval', () => {
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
    'answers a structured, a semantic, a hybrid and an EPC question, and writes the report',
    async () => {
      const startedAt = Date.now();
      const llm = app.get(ConfigService).getOrThrow<LlmConfig>('llm');
      const router = app.get(QueryRouter);
      const retrieval = app.get(HybridRetrievalService);
      const generator = app.get(AnswerGenerator);
      const paceMs = Number(process.env['EVAL_PACE_MS'] ?? DEFAULT_PACE_MS);

      const results: AnswerResult[] = [];
      for (const [index, item] of questions().entries()) {
        if (index > 0) {
          await sleep(paceMs);
        }
        const route = item.route ?? (await router.route(item.question));
        const found = await retrieval.retrieve(route);

        const answerStartedAt = performance.now();
        let firstTokenMs: number | null = null;
        let answer = '';
        let tokens = { inputTokens: 0, outputTokens: 0 };
        for await (const event of generator.stream(route.standaloneQuestion, found)) {
          if (event.kind === 'text') {
            firstTokenMs ??= Math.round(performance.now() - answerStartedAt);
            answer += event.text;
          } else {
            tokens = event.completion;
          }
        }

        results.push({
          label: item.label,
          question: item.question,
          routedAs: item.route ? `${route.intent}, set by hand` : route.intent,
          contextIds: found.properties.map((entry) => entry.property.id),
          answer,
          citedIds: citedPropertyIds(answer),
          inputTokens: tokens.inputTokens,
          outputTokens: tokens.outputTokens,
          firstTokenMs: firstTokenMs ?? 0,
          totalMs: Math.round(performance.now() - answerStartedAt),
        });
      }

      const path = reportPath(REPORT_FILE);
      const narrative = existsSync(path)
        ? extractSection(readFileSync(path, 'utf8'), NARRATIVE_HEADING)
        : null;
      writeFileSync(
        path,
        renderAnswerReport({
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          provider: llm.provider,
          answerModel: llm.answer.model,
          prompt: PROMPT,
          results,
          narrative,
        }),
      );

      expect(results.every((result) => result.answer.trim() !== '')).toBe(true);
    },
    RUN_TIMEOUT_MS,
  );
});
