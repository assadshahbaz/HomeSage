import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module.ts';
import { ChatService } from '../../src/app/chat/chat.service.ts';
import { noMatchMessage } from '../../src/app/chat/no-results/no-results-message.ts';
import { LlmService } from '../../src/app/llm/llm.service.ts';
import { SqlExecutor } from '../../src/app/sql/execution/sql-executor.ts';
import { SqlValidator } from '../../src/app/sql/validation/sql-validator.ts';
import type { ChatEvent } from '../../src/contracts/index.ts';
import type { LlmConfig } from '../../src/infra/config/llm.config.ts';
import { AppLogger } from '../../src/platform/logging/app-logger.ts';
import { reportPath } from './eval-data.ts';
import { GOLDEN_SLICE, loadGoldenSet } from './golden-set.ts';
import { extractSection, NARRATIVE_HEADING } from './render-semantic-report.ts';
import { isPassed, renderZeroMatchesReport } from './render-zero-matches-report.ts';
import type { ZeroMatchResult } from './render-zero-matches-report.ts';

const REPORT_FILE = 'm3-zero-matches.md';
// Three questions, each a router call and a SQL call, paced for a free tier.
const RUN_TIMEOUT_MS = 600_000;
// A router call and a SQL call are about 6,000 tokens and a free tier allows
// 8,000 a minute per model, so questions are 45 seconds apart. Override with EVAL_PACE_MS.
const DEFAULT_PACE_MS = 45_000;

describe('M3 zero matches eval', () => {
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
    'answers every zero match question as one with no answer call, and writes the report',
    async () => {
      const startedAt = Date.now();
      const llm = app.get(ConfigService).getOrThrow<LlmConfig>('llm');
      const chat = app.get(ChatService, { strict: false });
      const validator = app.get(SqlValidator, { strict: false });
      const executor = app.get(SqlExecutor, { strict: false });
      // Calls through to the real model, so a call that slips past the no match path is counted.
      const answerStream = vi.spyOn(app.get(LlmService, { strict: false }), 'stream');
      const paceMs = Number(process.env['EVAL_PACE_MS'] ?? DEFAULT_PACE_MS);

      const entries = loadGoldenSet().filter((entry) => entry.slice === GOLDEN_SLICE.ZERO_MATCHES);
      const results: ZeroMatchResult[] = [];
      for (const [index, entry] of entries.entries()) {
        if (entry.expected.kind !== 'rows') {
          throw new Error(`zero matches entry "${entry.id}" needs a rows reference`);
        }
        if (index > 0) {
          await sleep(paceMs);
        }
        const verdict = validator.validate(entry.expected.reference);
        if (!verdict.ok) {
          throw new Error(`reference was rejected: ${verdict.detail}`);
        }
        const referenceRows = (await executor.execute(verdict.sql)).length;

        answerStream.mockClear();
        const events: ChatEvent[] = [];
        for await (const event of chat.answerQuestion(entry.question)) {
          events.push(event);
        }
        const route = events.find((event) => event.type === 'route');
        const retrieval = events.find((event) => event.type === 'retrieval');
        const citations = events.find((event) => event.type === 'citations');
        const reply = events.map((event) => (event.type === 'token' ? event.text : '')).join('');
        results.push({
          question: entry.question,
          intent: route?.intent ?? 'none sent',
          fallback: route?.fallback ?? null,
          referenceRows,
          retrieval:
            retrieval === undefined
              ? 'none sent'
              : retrieval.kind === 'none'
                ? `none: ${retrieval.reason}`
                : retrieval.kind,
          reply,
          fixedMessage: route !== undefined && reply === noMatchMessage(route.filters),
          citations:
            citations === undefined
              ? 0
              : citations.kind === 'properties'
                ? citations.ids.length
                : 1,
          answerCalls: answerStream.mock.calls.length,
        });
      }

      const path = reportPath(REPORT_FILE);
      const narrative = existsSync(path)
        ? extractSection(readFileSync(path, 'utf8'), NARRATIVE_HEADING)
        : null;
      writeFileSync(
        path,
        renderZeroMatchesReport({
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          provider: llm.provider,
          routerModel: llm.router.model,
          sqlModel: llm.answer.model,
          results,
          narrative,
        }),
      );

      expect(results.filter((result) => !isPassed(result))).toEqual([]);
    },
    RUN_TIMEOUT_MS,
  );
});
