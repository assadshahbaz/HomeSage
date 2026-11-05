import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import type { Client } from '@elastic/elasticsearch';
import { HttpStatus } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import { z } from 'zod';
import { AppModule } from '../../src/app.module.ts';
import { INGESTION_MODE } from '../../src/app/ingestion/ingestion-mode.ts';
import { IngestionService } from '../../src/app/ingestion/ingestion.service.ts';
import {
  SEARCH_TOP_K_DEFAULT,
  SEARCH_TOP_K_MAX,
  semanticSearchResponseSchema,
} from '../../src/contracts/index.ts';
import type { ElasticsearchConfig } from '../../src/infra/config/elasticsearch.config.ts';
import type { EmbeddingsConfig } from '../../src/infra/config/embeddings.config.ts';
import { ELASTICSEARCH_CLIENT } from '../../src/infra/elasticsearch/elasticsearch.symbol.ts';
import { MysqlService } from '../../src/infra/mysql/mysql.service.ts';
import { AppLogger } from '../../src/platform/logging/app-logger.ts';
import { reportPath } from './eval-data.ts';
import { loadGoldenSet, requireRelevanceScored, selectEntries } from './golden-set.ts';
import { percentile } from './percentile.ts';
import {
  extractSection,
  isClean,
  NARRATIVE_HEADING,
  renderSemanticReport,
} from './render-semantic-report.ts';
import type { IndexCheck, IngestionRun, SemanticQuestionResult } from './render-semantic-report.ts';
import { scoreRecall } from './score-recall.ts';
import { SEMANTIC_SELECTION } from './semantic-selection.ts';

const REPORT_FILE = 'm2.md';
// The M2 definition of done: sensible results in under 500 ms warm.
const LATENCY_LIMIT_MS = 500;
const LATENCY_CALLS = 50;
const P50 = 50;
const P95 = 95;
// Two full ingestions on a local model, with room to spare.
const RUN_TIMEOUT_MS = 3_600_000;
// Elasticsearch's default result window; one listing of every document id must fit in it.
const MAX_LISTED_DOCUMENTS = 10_000;
// The sample alone is 50 calls plus one per question, past the per IP limit a
// visitor gets. Raised for this process only; the limit does not change how
// long a call takes.
const EVAL_THROTTLE_LIMIT = '1000';
const OK: number = HttpStatus.OK;

// Fixed and read only, like the ingestion reader's statements, so not model output for the validator.
const PROPERTY_IDS_SQL = 'SELECT id FROM properties ORDER BY id';
const idRowSchema = z.object({ id: z.number().int().positive() });
const hitIdSchema = z.object({ _id: z.string() });

describe('M2 semantic retrieval eval', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env['THROTTLE_LIMIT'] = EVAL_THROTTLE_LIMIT;
    app = await NestFactory.create(AppModule, { logger: false });
    const logger = app.get(AppLogger);
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(logger, level).mockImplementation(() => undefined);
    }
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it(
    'checks the index against MySQL, scores recall and latency, and writes the report',
    async () => {
      const startedAt = Date.now();
      const config = app.get(ConfigService);
      const { index } = config.getOrThrow<ElasticsearchConfig>('elasticsearch');
      const embeddings = config.getOrThrow<EmbeddingsConfig>('embeddings');
      const es = app.get<Client>(ELASTICSEARCH_CLIENT);
      const mysql = app.get(MysqlService);
      // Nest types its HTTP server as any; this is the one place it is named for supertest.
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      async function checkIndex(): Promise<IndexCheck> {
        await es.indices.refresh({ index });
        const mysqlIds = (await mysql.query<RowDataPacket>(PROPERTY_IDS_SQL)).map(
          (row) => idRowSchema.parse(row).id,
        );
        const indexed = (await es.count({ index })).count;
        if (indexed > MAX_LISTED_DOCUMENTS) {
          throw new Error(`${String(indexed)} documents is more than one listing can return`);
        }
        const response = await es.search({
          index,
          size: MAX_LISTED_DOCUMENTS,
          _source: false,
          query: { match_all: {} },
        });
        const documentIds = response.hits.hits.map((hit) => hitIdSchema.parse(hit)._id);
        const expected = new Set(mysqlIds.map(String));
        const seen = new Set<string>();
        const extra: string[] = [];
        for (const id of documentIds) {
          if (!expected.has(id) || seen.has(id)) {
            extra.push(id);
          }
          seen.add(id);
        }
        return {
          mysqlRows: mysqlIds.length,
          indexed,
          missing: mysqlIds.filter((id) => !seen.has(String(id))),
          extra,
        };
      }

      async function ingest(label: string): Promise<IngestionRun> {
        const summary = await app
          .get(IngestionService)
          .run({ mode: INGESTION_MODE.FULL, restart: true });
        return {
          label,
          read: summary.read,
          written: summary.written,
          failed: summary.failed,
          durationMs: summary.durationMs,
          embeddingCalls: summary.embedding.calls,
          inputTokens: summary.embedding.inputTokens,
          costUsd: summary.embedding.costUsd,
          check: await checkIndex(),
        };
      }

      async function search(query: string, topK: number): Promise<number[]> {
        const response = await request(server).post('/search/semantic').send({ query, topK });
        if (response.status !== OK) {
          throw new Error(
            `POST /search/semantic answered ${String(response.status)}: ${JSON.stringify(response.body)}`,
          );
        }
        return semanticSearchResponseSchema
          .parse(response.body)
          .results.map((result) => Number(result.id));
      }

      const ingestion =
        process.env['EVAL_REINGEST'] === '1'
          ? [await ingest('full run'), await ingest('rerun')]
          : null;
      const check = await checkIndex();

      const entries = requireRelevanceScored(selectEntries(loadGoldenSet(), SEMANTIC_SELECTION));
      if (entries.length === 0) {
        throw new Error('the semantic selection picked no golden set entries');
      }
      const questions: SemanticQuestionResult[] = [];
      for (const entry of entries) {
        const ranking = await search(entry.question, SEARCH_TOP_K_MAX);
        const uncertain = entry.expected.uncertainIds ?? [];
        questions.push({
          id: entry.id,
          category: entry.category,
          question: entry.question,
          relevant: entry.expected.ids.length,
          uncertain: uncertain.length,
          atTopK: scoreRecall(ranking, entry.expected.ids, uncertain, SEARCH_TOP_K_DEFAULT),
          atMax: scoreRecall(ranking, entry.expected.ids, uncertain, SEARCH_TOP_K_MAX),
        });
      }

      // Every question has been asked once above, so the model and the index are warm.
      const timings: number[] = [];
      for (let call = 0; call < LATENCY_CALLS; call++) {
        const callStartedAt = performance.now();
        await search(entries[call % entries.length].question, SEARCH_TOP_K_DEFAULT);
        timings.push(Math.round(performance.now() - callStartedAt));
      }
      const latency = {
        calls: timings.length,
        topK: SEARCH_TOP_K_DEFAULT,
        p50Ms: percentile(timings, P50),
        p95Ms: percentile(timings, P95),
        maxMs: Math.max(...timings),
      };

      const path = reportPath(REPORT_FILE);
      const narrative = existsSync(path)
        ? extractSection(readFileSync(path, 'utf8'), NARRATIVE_HEADING)
        : null;
      writeFileSync(
        path,
        renderSemanticReport({
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          embeddingProvider: embeddings.provider,
          embeddingModel: embeddings.model,
          dimensions: embeddings.dimensions,
          inputUsdPerMillion: embeddings.inputUsdPerMillion,
          index,
          topK: SEARCH_TOP_K_DEFAULT,
          maxTopK: SEARCH_TOP_K_MAX,
          latencyLimitMs: LATENCY_LIMIT_MS,
          selection: SEMANTIC_SELECTION,
          questions,
          latency,
          ingestion,
          check,
          narrative,
        }),
      );

      for (const ingestionRun of ingestion ?? []) {
        expect(isClean(ingestionRun.check)).toBe(true);
      }
      expect(isClean(check)).toBe(true);
      expect(latency.p95Ms).toBeLessThan(LATENCY_LIMIT_MS);
    },
    RUN_TIMEOUT_MS,
  );
});
