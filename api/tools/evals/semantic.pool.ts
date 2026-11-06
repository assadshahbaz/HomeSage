import { writeFileSync } from 'node:fs';
import type { Client } from '@elastic/elasticsearch';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { AppModule } from '../../src/app.module.ts';
import { SemanticSearchService } from '../../src/app/retrieval/semantic-search.service.ts';
import { SqlExecutor } from '../../src/app/sql/execution/sql-executor.ts';
import { SqlValidator } from '../../src/app/sql/validation/sql-validator.ts';
import { PROPERTY_KIND } from '../../src/contracts/index.ts';
import type { ElasticsearchConfig } from '../../src/infra/config/elasticsearch.config.ts';
import type { EmbeddingsConfig } from '../../src/infra/config/embeddings.config.ts';
import { ELASTICSEARCH_CLIENT } from '../../src/infra/elasticsearch/elasticsearch.symbol.ts';
import { repoPath } from '../repo-path.ts';
import { mergePool, POOL_PATH } from './candidate-pool.ts';
import type { PathResult, PoolPath } from './candidate-pool.ts';
import { loadLabellingQuestions } from './labelling-questions.ts';
import type { LabellingQuestion } from './labelling-questions.ts';
import { renderWorksheet } from './render-worksheet.ts';
import type { CandidateRecord, WorksheetQuestion } from './render-worksheet.ts';

const MILESTONE = 'M2';
const QUESTIONS = 'workbench/evals/labelling/m2-questions.json';
const WORKSHEET = 'workbench/evals/labelling/m2-worksheet.md';
const PROPOSED = 'workbench/evals/labelling/m2-proposed.json';
// The pooling method takes the top 20 from each path.
const PER_PATH = 20;
// Verdicts run through the validator, which caps a query at 50 rows, so a pool
// is judged in chunks safely under it.
const VERDICT_CHUNK = 40;
const JSON_INDENT = 2;
// Twenty kNN searches and a hundred small queries; generous for a cold model.
const RUN_TIMEOUT_MS = 600_000;

// The features a record can state, in the words the worksheet shows them in.
const FACT_COLUMNS = [
  ['has_garden', 'garden'],
  ['has_garage', 'garage'],
  ['has_double_garage', 'double garage'],
  ['has_land', 'land'],
  ['has_off_street_parking', 'off street parking'],
  ['has_on_street_parking', 'on street parking'],
  ['has_ground_floor_bedroom_bathroom', 'ground floor bedroom and bathroom'],
  ['has_granny_flat', 'granny flat'],
  ['has_green_energy', 'green energy'],
  ['has_electric_vehicle_charge_point', 'EV charge point'],
  ['is_new_build', 'new build'],
  ['is_development_opportunity', 'development opportunity'],
] as const;

// Fixed, not model written, and read only; it still goes through the validator.
const RECORD_SQL = (ids: readonly number[]): string =>
  `SELECT p.id, p.full_address, p.property_kind, p.bedrooms, p.price, ${FACT_COLUMNS.map(([column]) => `p.${column}`).join(', ')}, d.heating_type FROM properties p LEFT JOIN property_disclosures d ON d.property_id = p.id WHERE p.id IN (${ids.join(', ')})`;

const recordSchema = z
  .object({
    id: z.number(),
    full_address: z.string(),
    property_kind: z.string(),
    bedrooms: z.number().nullable(),
    price: z.number(),
    heating_type: z.string().nullable(),
  })
  .catchall(z.unknown());
const idRowSchema = z.object({ id: z.number() });
const bm25HitSchema = z.object({ _id: z.string() });

/**
 * `npm run evals:pool`: builds the candidate pool for each M2 question from the
 * three retrieval paths, reads every candidate's MySQL record, proposes a
 * label by the question's rule, and writes the worksheet a reviewer checks
 * before the labels go into the golden set. Needs the Docker stack with a full
 * index; changes nothing but the two files it writes.
 */
describe('M2 labelling pool', () => {
  let app: INestApplicationContext;

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it(
    'pools, reads and proposes labels for every question, and writes the worksheet',
    async () => {
      const config = app.get(ConfigService);
      const { index } = config.getOrThrow<ElasticsearchConfig>('elasticsearch');
      const { model } = config.getOrThrow<EmbeddingsConfig>('embeddings');
      const es = app.get<Client>(ELASTICSEARCH_CLIENT);
      const semantic = app.get(SemanticSearchService);
      const validator = app.get(SqlValidator, { strict: false });
      const executor = app.get(SqlExecutor, { strict: false });

      async function run(sql: string): Promise<RowDataPacket[]> {
        const verdict = validator.validate(sql);
        if (!verdict.ok) {
          throw new Error(`the validator rejected ${sql}: ${verdict.detail}`);
        }
        return (await executor.execute(verdict.sql)) as RowDataPacket[];
      }

      async function sqlPath(question: LabellingQuestion): Promise<number[]> {
        const rows = await run(`${question.rule} ORDER BY p.id LIMIT ${String(PER_PATH)}`);
        return rows.map((row) => idRowSchema.parse(row).id);
      }

      async function bm25Path(question: LabellingQuestion): Promise<number[]> {
        const response = await es.search({
          index,
          size: PER_PATH,
          _source: false,
          query: {
            bool: {
              must: { match: { text: question.question } },
              filter: { term: { property_kind: PROPERTY_KIND.RESIDENTIAL } },
            },
          },
        });
        return response.hits.hits.map((hit) => Number(bm25HitSchema.parse(hit)._id));
      }

      async function knnPath(question: LabellingQuestion): Promise<number[]> {
        const { results } = await semantic.search({
          query: question.question,
          topK: PER_PATH,
          filters: { propertyKinds: [PROPERTY_KIND.RESIDENTIAL] },
        });
        return results.map((result) => Number(result.id));
      }

      /** The ids among `ids` whose record the rule selects, a chunk at a time. */
      async function relevantAmong(
        question: LabellingQuestion,
        ids: number[],
      ): Promise<Set<number>> {
        const relevant = new Set<number>();
        for (let start = 0; start < ids.length; start += VERDICT_CHUNK) {
          const chunk = ids.slice(start, start + VERDICT_CHUNK);
          const rows = await run(`${question.rule} AND p.id IN (${chunk.join(', ')})`);
          for (const row of rows) {
            relevant.add(idRowSchema.parse(row).id);
          }
        }
        return relevant;
      }

      async function records(ids: number[]): Promise<Map<number, CandidateRecord>> {
        const found = new Map<number, CandidateRecord>();
        for (let start = 0; start < ids.length; start += VERDICT_CHUNK) {
          const rows = await run(RECORD_SQL(ids.slice(start, start + VERDICT_CHUNK)));
          for (const row of rows) {
            const record = recordSchema.parse(row);
            const facts: string[] = FACT_COLUMNS.filter(([column]) => Boolean(record[column])).map(
              ([, words]) => words,
            );
            if (record.heating_type !== null) {
              facts.push(`${record.heating_type} heating`);
            }
            found.set(record.id, {
              address: record.full_address,
              kind: record.property_kind,
              bedrooms: record.bedrooms,
              price: record.price,
              facts,
            });
          }
        }
        return found;
      }

      const questions = loadLabellingQuestions(QUESTIONS);
      const worksheetQuestions: WorksheetQuestion[] = [];
      for (const question of questions) {
        const paths: PathResult[] = [
          { path: POOL_PATH.SQL, ids: await sqlPath(question) },
          { path: POOL_PATH.BM25, ids: await bm25Path(question) },
          { path: POOL_PATH.KNN, ids: await knnPath(question) },
        ];
        const pool = mergePool(paths);
        const ids = pool.map((candidate) => candidate.id);
        const [relevant, byId] = await Promise.all([relevantAmong(question, ids), records(ids)]);
        worksheetQuestions.push({
          question,
          pathCounts: Object.fromEntries(
            paths.map(({ path, ids: found }) => [path, found.length]),
          ) as Record<PoolPath, number>,
          candidates: pool.map((candidate) => {
            const record = byId.get(candidate.id);
            if (record === undefined) {
              throw new Error(`property ${String(candidate.id)} is in the pool but not in MySQL`);
            }
            return { ...candidate, record, relevant: relevant.has(candidate.id) };
          }),
        });
      }

      writeFileSync(
        repoPath(WORKSHEET),
        renderWorksheet({
          milestone: MILESTONE,
          generatedAt: new Date().toISOString(),
          embeddingModel: model,
          questions: worksheetQuestions,
        }),
      );
      writeFileSync(
        repoPath(PROPOSED),
        `${JSON.stringify(
          worksheetQuestions.map(({ question, candidates }) => ({
            id: question.id,
            relevantIds: candidates
              .filter((candidate) => candidate.relevant)
              .map((candidate) => candidate.id)
              .sort((left, right) => left - right),
          })),
          null,
          JSON_INDENT,
        )}\n`,
      );

      for (const { candidates } of worksheetQuestions) {
        expect(candidates.length).toBeGreaterThan(0);
      }
    },
    RUN_TIMEOUT_MS,
  );
});
