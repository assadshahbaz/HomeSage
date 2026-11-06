import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { AppModule } from '../../src/app.module.ts';
import { QueryRouter } from '../../src/app/router/query-router.ts';
import type { Route } from '../../src/app/router/route.ts';
import { PROPERTY_KIND, ROUTE_FALLBACK } from '../../src/contracts/index.ts';
import type { LlmConfig } from '../../src/infra/config/llm.config.ts';
import { AppLogger } from '../../src/platform/logging/app-logger.ts';
import { loadRouterCases, reportPath } from './eval-data.ts';
import { loadGoldenSet } from './golden-set.ts';
import { renderRouterReport } from './render-router-report.ts';
import type { RouterQuestionResult } from './render-router-report.ts';
import { extractSection, NARRATIVE_HEADING } from './render-semantic-report.ts';
import type { RouteExpectation } from './route-expectation.ts';
import { scoreRoute } from './score-route.ts';

const REPORT_FILE = 'm3-router.md';
// About fifty questions, paced for a free tier per minute token limit, with room for retries.
const RUN_TIMEOUT_MS = 5_400_000;
// A router call is about 2,400 tokens and a free tier allows 8,000 a minute,
// so calls are 30 seconds apart. Override with EVAL_PACE_MS.
const DEFAULT_PACE_MS = 30_000;
// A timeout or provider error gets one more go after a pause, so a rate limit
// is not scored as the router's reading. A wrong reading never does.
const PROVIDER_RETRY_DELAY_MS = 30_000;
const RETRIED_FALLBACKS: readonly (string | null)[] = [
  ROUTE_FALLBACK.TIMEOUT,
  ROUTE_FALLBACK.PROVIDER_ERROR,
];

const droppedSchema = z.object({ dropped: z.array(z.unknown()) });
const llmLineSchema = z.object({ prompt: z.string() });

interface EvalQuestion {
  readonly id: string;
  readonly source: string;
  readonly question: string;
  readonly route: RouteExpectation;
}

describe('M3 router eval', () => {
  let app: INestApplicationContext;
  let dropped = 0;
  const prompts = new Set<string>();

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const logger = app.get(AppLogger);
    vi.spyOn(logger, 'warn').mockImplementation((message: unknown, ...params: unknown[]) => {
      const parsed = droppedSchema.safeParse(params[0]);
      if (String(message).startsWith('router dropped') && parsed.success) {
        dropped += parsed.data.dropped.length;
      }
    });
    vi.spyOn(logger, 'log').mockImplementation((_: unknown, ...params: unknown[]) => {
      const parsed = llmLineSchema.safeParse(params[0]);
      if (parsed.success) {
        prompts.add(parsed.data.prompt);
      }
    });
    for (const level of ['error', 'debug'] as const) {
      vi.spyOn(logger, level).mockImplementation(() => undefined);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it(
    'routes the golden set and the router cases, and writes the report',
    async () => {
      const startedAt = Date.now();
      const llm = app.get(ConfigService).getOrThrow<LlmConfig>('llm');
      const router = app.get(QueryRouter);
      const paceMs = Number(process.env['EVAL_PACE_MS'] ?? DEFAULT_PACE_MS);

      const questions: EvalQuestion[] = [
        ...loadGoldenSet().flatMap((entry) =>
          entry.route === undefined
            ? []
            : [
                {
                  id: entry.id,
                  source: `golden: ${entry.slice}`,
                  question: entry.question,
                  route: entry.route,
                },
              ],
        ),
        ...loadRouterCases().map((routerCase) => ({
          ...routerCase,
          source: `cases: ${routerCase.category}`,
        })),
      ];

      async function routeTimed(question: string): Promise<{ route: Route; latencyMs: number }> {
        const started = performance.now();
        const route = await router.route(question);
        return { route, latencyMs: Math.round(performance.now() - started) };
      }

      const results: RouterQuestionResult[] = [];
      for (const [index, question] of questions.entries()) {
        if (index > 0) {
          await sleep(paceMs);
        }
        dropped = 0;
        let attempt = await routeTimed(question.question);
        if (RETRIED_FALLBACKS.includes(attempt.route.fallback)) {
          await sleep(PROVIDER_RETRY_DELAY_MS);
          dropped = 0;
          attempt = await routeTimed(question.question);
        }
        const { route, latencyMs } = attempt;
        results.push({
          id: question.id,
          source: question.source,
          question: question.question,
          expectedIntents: question.route.intents,
          intent: route.intent,
          filters: Object.entries(route.filters)
            .filter(
              ([name, value]) =>
                !(
                  name === 'propertyKinds' &&
                  Array.isArray(value) &&
                  value.length === 1 &&
                  value[0] === PROPERTY_KIND.RESIDENTIAL
                ),
            )
            .map(([name]) => name),
          score: scoreRoute(question.route, route),
          dropped,
          fallback: route.fallback,
          latencyMs,
        });
      }

      const path = reportPath(REPORT_FILE);
      const narrative = existsSync(path)
        ? extractSection(readFileSync(path, 'utf8'), NARRATIVE_HEADING)
        : null;
      writeFileSync(
        path,
        renderRouterReport({
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          provider: llm.provider,
          model: llm.router.model,
          prompt: [...prompts].join(', '),
          timeoutMs: llm.router.timeoutMs,
          temperature: llm.router.temperature,
          questions: results,
          narrative,
        }),
      );

      expect(results).toHaveLength(questions.length);
    },
    RUN_TIMEOUT_MS,
  );
});
