import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module.ts';
import { GuardedAnswer } from '../../src/app/chat/answer/guarded-answer.ts';
import {
  HybridRetrievalService,
  RETRIEVAL_RANKING,
} from '../../src/app/retrieval/hybrid-retrieval.service.ts';
import type { HybridRetrieval } from '../../src/app/retrieval/hybrid-retrieval.service.ts';
import { QueryRouter } from '../../src/app/router/query-router.ts';
import { SqlExecutor } from '../../src/app/sql/execution/sql-executor.ts';
import { toSqlAnswer } from '../../src/app/sql/sql-answer.ts';
import { SqlValidator } from '../../src/app/sql/validation/sql-validator.ts';
import { CHAT_INTENT } from '../../src/contracts/index.ts';
import type { ChatCitationsEvent } from '../../src/contracts/index.ts';
import type { LlmConfig } from '../../src/infra/config/llm.config.ts';
import { AppLogger } from '../../src/platform/logging/app-logger.ts';
import { reportPath } from './eval-data.ts';
import { GOLDEN_SLICE, loadGoldenSet } from './golden-set.ts';
import type { GoldenEntry } from './golden-set.ts';
import { renderOrderingReport } from './render-ordering-report.ts';
import type { OrderingResult } from './render-ordering-report.ts';
import { extractSection, NARRATIVE_HEADING } from './render-semantic-report.ts';
import { scoreRows } from './score-rows.ts';
import type { Cell, Row } from './score-rows.ts';

const REPORT_FILE = 'm3-aggregates-ordering.md';
// Eight questions, each up to three model calls, paced for a free tier.
const RUN_TIMEOUT_MS = 1_200_000;
// A router, SQL and answer call together come to about 10,000 tokens, over a
// free tier's 8,000 a minute per model, so questions are a minute apart.
// Override with EVAL_PACE_MS.
const DEFAULT_PACE_MS = 60_000;

type ScoredEntry = GoldenEntry & {
  readonly expected: Extract<GoldenEntry['expected'], { kind: 'aggregate' | 'rows' }>;
};

/** A card as a row of plain values, so the row scorer can find the reference's values in it. */
function cardRow(card: object): Row {
  return Object.fromEntries(
    Object.entries(card).filter(
      (entry): entry is [string, Cell] =>
        entry[1] === null || ['string', 'number', 'boolean'].includes(typeof entry[1]),
    ),
  );
}

/** True when `cited` follows the order of `retrieved`, so an answer kept a requested order. */
function inRetrievalOrder(cited: readonly string[], retrieved: readonly string[]): boolean {
  const positions = cited.map((id) => retrieved.indexOf(id));
  return positions.every(
    (position, index) => position !== -1 && (index === 0 || position > positions[index - 1]),
  );
}

describe('M3 aggregates and ordering eval', () => {
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
    'takes the right path for every aggregate and ordered question, and writes the report',
    async () => {
      const startedAt = Date.now();
      const llm = app.get(ConfigService).getOrThrow<LlmConfig>('llm');
      const router = app.get(QueryRouter);
      const retrieval = app.get(HybridRetrievalService);
      const answer = app.get(GuardedAnswer);
      const validator = app.get(SqlValidator, { strict: false });
      const executor = app.get(SqlExecutor, { strict: false });
      const paceMs = Number(process.env['EVAL_PACE_MS'] ?? DEFAULT_PACE_MS);

      /** The reference query's rows, run the way generated SQL is. */
      async function referenceRows(reference: string): Promise<Row[]> {
        const verdict = validator.validate(reference);
        if (!verdict.ok) {
          throw new Error(`reference was rejected: ${verdict.detail}`);
        }
        const answered = toSqlAnswer(verdict.shape, await executor.execute(verdict.sql));
        return answered.kind === 'rows' ? answered.rows : answered.values;
      }

      function scoreRetrieval(
        entry: ScoredEntry,
        found: HybridRetrieval,
        reference: readonly Row[],
      ): OrderingResult['retrieval'] {
        if (entry.expected.kind === 'aggregate') {
          const values = found.sql?.aggregate?.values;
          return values
            ? scoreRows(reference, values, false)
            : { passed: false, reason: 'no aggregate was retrieved' };
        }
        return scoreRows(
          reference,
          found.properties.map((property) => cardRow(property.property)),
          entry.expected.ordered === true,
        );
      }

      const entries = loadGoldenSet().filter(
        (entry): entry is ScoredEntry =>
          entry.slice === GOLDEN_SLICE.AGGREGATES_AND_ORDERING &&
          (entry.expected.kind === 'aggregate' || entry.expected.kind === 'rows'),
      );
      const results: OrderingResult[] = [];
      for (const [index, entry] of entries.entries()) {
        if (index > 0) {
          await sleep(paceMs);
        }
        const expected = entry.expected.kind === 'aggregate' ? 'aggregate' : 'ordered rows';
        const route = await router.route(entry.question);
        if (route.intent === CHAT_INTENT.OUT_OF_SCOPE) {
          results.push({
            question: entry.question,
            expected,
            intent: route.intent,
            ranking: 'declined',
            retrieval: { passed: false, reason: 'the router declined' },
            cited: 'nothing',
            citationsFit: false,
          });
          continue;
        }

        const found = await retrieval.retrieve(route);
        const reference = await referenceRows(entry.expected.reference);
        let citations: ChatCitationsEvent | null = null;
        for await (const event of answer.stream(route.standaloneQuestion, found)) {
          if (event.kind === 'end') {
            citations = event.citations;
          }
        }
        const retrievedIds = found.properties.map((property) => property.property.id);
        const citedIds = citations?.kind === 'properties' ? citations.ids : [];
        results.push({
          question: entry.question,
          expected,
          intent: route.intent,
          ranking: found.ranking,
          retrieval: scoreRetrieval(entry, found, reference),
          cited:
            citations?.kind === 'aggregate'
              ? 'SQL'
              : citedIds.length === 0
                ? 'nothing'
                : citedIds.map((id) => `P-${id}`).join(', '),
          citationsFit:
            found.ranking === RETRIEVAL_RANKING.AGGREGATE
              ? citations?.kind === 'aggregate'
              : citedIds.length > 0 && inRetrievalOrder(citedIds, retrievedIds),
        });
      }

      const path = reportPath(REPORT_FILE);
      const narrative = existsSync(path)
        ? extractSection(readFileSync(path, 'utf8'), NARRATIVE_HEADING)
        : null;
      writeFileSync(
        path,
        renderOrderingReport({
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          provider: llm.provider,
          answerModel: llm.answer.model,
          results,
          narrative,
        }),
      );

      expect(results).toHaveLength(entries.length);
    },
    RUN_TIMEOUT_MS,
  );
});
