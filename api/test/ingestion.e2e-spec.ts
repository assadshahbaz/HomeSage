import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from '@elastic/elasticsearch';
import type { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import mysql from 'mysql2/promise';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import type {
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResponse,
} from '../src/core/embedding-provider.ts';
import { EmbeddingService } from '../src/app/embeddings/embedding.service.ts';
import { INGESTION_MODE } from '../src/app/ingestion/ingestion-mode.ts';
import type { IngestionOptions } from '../src/app/ingestion/ingestion-mode.ts';
import { IngestionService } from '../src/app/ingestion/ingestion.service.ts';
import type { IngestionSummary } from '../src/app/ingestion/ingestion.service.ts';
import { IngestionRunState } from '../src/app/ingestion/run-state/ingestion-run-state.ts';
import { PropertyIndex } from '../src/app/ingestion/search-index/property-index.ts';
import type { IndexedProperty } from '../src/app/ingestion/search-index/property-index.ts';
import { PropertyReader } from '../src/app/ingestion/source/property-reader.ts';
import { createMysqlPool } from '../src/infra/mysql/mysql-pool.ts';
import { MysqlService } from '../src/infra/mysql/mysql.service.ts';
import type { AppLogger } from '../src/platform/logging/app-logger.ts';
import { repoPath } from '../tools/repo-path.ts';

// The images docker-compose.yml runs, so the test and the local stack agree.
const MYSQL_IMAGE = 'mysql:8.4.11';
const ES_IMAGE = 'elasticsearch:8.19.21';
const REDIS_IMAGE = 'redis:8.8.2';
const MYSQL_PORT = 3306;
const ES_PORT = 9200;
const REDIS_PORT = 6379;
const DATABASE = 'homesage';
const ROOT_PASSWORD = 'root-secret';
const RO_USER = 'rag_ro';
const RO_PASSWORD = 'ro-secret';
const DIMENSIONS = 4;
// Seven listings in pages of three: two full pages and one short one.
const PAGE_SIZE = 3;
const PROPERTY_IDS = [1201, 1202, 1203, 1204, 1205, 1206, 1207];
const WITH_QUESTIONNAIRE = [1202, 1205];
// Pulling three images and starting the JVM takes a while on a cold machine.
const STARTUP_TIMEOUT_MS = 300_000;
const FULL: IngestionOptions = { mode: INGESTION_MODE.FULL, restart: false };
const CHANGED_ID = 1204;
const CHANGED_PRICE = 99_000;
// `updated_at` has second precision, so a change and the bound taken after it
// only differ once a second boundary has passed.
const PAST_THE_SECOND_MS = 1_100;

// A zone well off UTC, with no summer time, so a pool that read MySQL's UTC
// timestamps as local time would be caught by several hours.
process.env['TZ'] = 'Asia/Kolkata';

// A stand in for the model: the same text always gives the same vector, and
// different texts almost always different ones. No real model is called.
const fakeProvider: EmbeddingProvider = {
  embedDocuments: (request: EmbeddingRequest): Promise<EmbeddingResponse> =>
    Promise.resolve({
      vectors: request.texts.map((text) => {
        let sum = 0;
        for (let position = 0; position < text.length; position++) {
          sum += text.charCodeAt(position);
        }
        return [1, (sum % 97) / 97, (text.length % 89) / 89, 0.5];
      }),
      inputTokens: request.texts.length * 50,
    }),
  embedQueries: () => Promise.reject(new Error('not used')),
  retryAfterMs: () => null,
};

function config(index: string): ConfigService {
  const values: Record<string, unknown> = {
    elasticsearch: { index },
    embeddings: {
      provider: 'fake',
      apiKey: 'unused',
      model: 'fake-embedding-model',
      dimensions: DIMENSIONS,
      batchSize: PAGE_SIZE,
      timeoutMs: 5_000,
      maxAttempts: 1,
      textsPerMinute: null,
      inputUsdPerMillion: 0.2,
    },
  };
  return { getOrThrow: (key: string) => values[key] } as unknown as ConfigService;
}

const logger = { log: () => undefined, warn: () => undefined } as unknown as AppLogger;

/** The bound a run reported for the next sync, which a fresh run always has. */
function bound(summary: IngestionSummary): Date {
  if (summary.nextSince === null) {
    throw new Error('the run reported no bound for the next sync');
  }
  return summary.nextSince;
}

/**
 * Runs the ingestion against real MySQL, Elasticsearch and Redis, each in its
 * own container, with the schema and read only account the local stack uses.
 * Needs Docker but not the compose stack.
 */
describe('IngestionService against MySQL, Elasticsearch and Redis', () => {
  let containers: StartedTestContainer[];
  let pool: mysql.Pool;
  let es: Client;
  let redis: Redis;
  let rootOptions: mysql.ConnectionOptions;

  function service(index: string): { ingestion: IngestionService; propertyIndex: PropertyIndex } {
    const settings = config(index);
    const propertyIndex = new PropertyIndex(es, settings);
    const ingestion = new IngestionService(
      new PropertyReader(new MysqlService(pool)),
      new EmbeddingService(fakeProvider, settings, logger),
      propertyIndex,
      new IngestionRunState(redis, settings),
      logger,
      settings,
    );
    return { ingestion, propertyIndex };
  }

  async function documents(index: string): Promise<IndexedProperty[]> {
    const response = await es.search<IndexedProperty>({
      index,
      size: PROPERTY_IDS.length + 1,
      sort: [{ id: 'asc' }],
    });
    return response.hits.hits.flatMap((hit) => (hit._source ? [hit._source] : []));
  }

  beforeAll(async () => {
    containers = await Promise.all([
      new GenericContainer(MYSQL_IMAGE)
        .withEnvironment({
          MYSQL_ROOT_PASSWORD: ROOT_PASSWORD,
          MYSQL_DATABASE: DATABASE,
          MYSQL_RO_USER: RO_USER,
          MYSQL_RO_PASSWORD: RO_PASSWORD,
        })
        // The same script the local stack runs, so the reads go through the same grant.
        .withCopyFilesToContainer([
          {
            source: repoPath('workbench/docker/mysql/init/01-read-only-user.sh'),
            target: '/docker-entrypoint-initdb.d/01-read-only-user.sh',
            mode: 0o755,
          },
        ])
        .withExposedPorts(MYSQL_PORT)
        // The entrypoint starts a temporary server for the init scripts first; this is the real one.
        .withWaitStrategy(Wait.forLogMessage(/ready for connections.*port: 3306/))
        .withStartupTimeout(STARTUP_TIMEOUT_MS)
        .start(),
      new GenericContainer(ES_IMAGE)
        .withEnvironment({
          'discovery.type': 'single-node',
          'xpack.security.enabled': 'false',
          ES_JAVA_OPTS: '-Xms512m -Xmx512m',
        })
        .withExposedPorts(ES_PORT)
        .withWaitStrategy(
          Wait.forHttp('/_cluster/health?wait_for_status=green&timeout=30s', ES_PORT),
        )
        .withStartupTimeout(STARTUP_TIMEOUT_MS)
        .start(),
      new GenericContainer(REDIS_IMAGE)
        .withExposedPorts(REDIS_PORT)
        .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
        .start(),
    ]);
    const [mysqlContainer, esContainer, redisContainer] = containers;

    // The schema and the rows go in as root, exactly as the import tool writes them.
    rootOptions = {
      host: mysqlContainer.getHost(),
      port: mysqlContainer.getMappedPort(MYSQL_PORT),
      user: 'root',
      password: ROOT_PASSWORD,
      database: DATABASE,
      multipleStatements: true,
    };
    const root = await mysql.createConnection(rootOptions);
    await root.query(readFileSync(repoPath('api/tools/seed/schema.sql'), 'utf8'));
    for (const [position, id] of PROPERTY_IDS.entries()) {
      await root.query(
        `INSERT INTO properties (id, full_address, post_code, postcode_district, town, price, area_m2,
           council_tax_band, bedrooms, bathrooms, public_rooms, property_kind, has_garden)
         VALUES (?, ?, 'AB10 6CK', 'AB10', 'Aberdeen', ?, ?, 'C', ?, 1, 1, 'residential', ?)`,
        [
          id,
          `${String(id)} Fernlea Grove, Aberdeen, AB10 6CK`,
          120_000 + position * 10_000,
          60 + position,
          1 + (position % 3),
          position % 2 === 0,
        ],
      );
    }
    for (const id of WITH_QUESTIONNAIRE) {
      await root.query(
        `INSERT INTO property_disclosures (property_id, heating_type, parking_arrangements, central_heating, windows_replaced)
         VALUES (?, 'gas', 'on the street', 'yes', 'no')`,
        [id],
      );
    }
    // Set in the past explicitly, so no row shares a second with a later sync bound.
    await root.query('UPDATE properties SET updated_at = NOW() - INTERVAL 1 HOUR');
    await root.end();

    // The service reads through the read only account the init script created,
    // on the pool the API itself uses.
    pool = createMysqlPool({
      host: mysqlContainer.getHost(),
      port: mysqlContainer.getMappedPort(MYSQL_PORT),
      user: RO_USER,
      password: RO_PASSWORD,
      database: DATABASE,
    });
    es = new Client({
      node: `http://${esContainer.getHost()}:${String(esContainer.getMappedPort(ES_PORT))}`,
    });
    redis = new Redis(redisContainer.getMappedPort(REDIS_PORT), redisContainer.getHost());
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await pool.end();
    await es.close();
    redis.disconnect();
    await Promise.all(containers.map((container) => container.stop()));
  });

  it('indexes every property, and a second full run gives the same documents and count', async () => {
    const { ingestion } = service('properties-rerun');

    const first = await ingestion.run(FULL);
    const firstDocuments = await documents('properties-rerun');
    const second = await ingestion.run(FULL);
    const secondDocuments = await documents('properties-rerun');

    expect(first).toMatchObject({
      read: 7,
      written: 7,
      failed: 0,
      indexed: 7,
      resumedAfterId: null,
    });
    expect(first.embedding).toEqual({ calls: 3, inputTokens: 350, costUsd: 0.00007 });
    expect(second).toMatchObject({ written: 7, failed: 0, indexed: 7, resumedAfterId: null });
    expect(firstDocuments.map((document) => document.id)).toEqual(PROPERTY_IDS.map(String));
    expect(secondDocuments).toEqual(firstDocuments);
    // A questionnaire made it through the join into the text and the filter fields.
    const withQuestionnaire = firstDocuments.find((document) => document.id === '1202');
    expect(withQuestionnaire?.heating_type).toBe('gas');
    expect(withQuestionnaire?.text).toContain('Gas central heating. Parking: On the street.');
    expect(withQuestionnaire?.embedding).toHaveLength(DIMENSIONS);
  });

  it('resumes a run that stopped after its first page, ending where a clean run ends', async () => {
    const { ingestion: clean } = service('properties-clean');
    await clean.run(FULL);

    const { ingestion, propertyIndex } = service('properties-resumed');
    const write = propertyIndex.upsert.bind(propertyIndex);
    const upsert = vi
      .spyOn(propertyIndex, 'upsert')
      .mockImplementationOnce(write)
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:9200'));

    await expect(ingestion.run(FULL)).rejects.toThrow('ECONNREFUSED');
    upsert.mockRestore();
    const resumed = await ingestion.run(FULL);

    expect(resumed).toMatchObject({
      resumedAfterId: 1203,
      read: 4,
      written: 4,
      failed: 0,
      indexed: 7,
    });
    expect(await documents('properties-resumed')).toEqual(await documents('properties-clean'));
    // Finished, so the checkpoint is gone and the next run starts from the beginning.
    expect(
      await new IngestionRunState(redis, config('properties-resumed')).checkpoint(),
    ).toBeNull();
  });

  it('stores each updated_at as the instant MySQL holds, whatever the process time zone', async () => {
    const { ingestion } = service('properties-time');
    await ingestion.run(FULL);

    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT id, UNIX_TIMESTAMP(updated_at) AS seconds FROM properties ORDER BY id',
    );
    const indexed = await documents('properties-time');
    expect(
      indexed.map((document) => [document.id, Date.parse(document.updated_at) / 1000]),
    ).toEqual(rows.map((row) => [String(row['id']), Number(row['seconds'])]));
  });

  // Last, since it changes a row the other tests index.
  it('re-indexes exactly the property that changed, then nothing when nothing did', async () => {
    const { ingestion } = service('properties-sync');
    const full = await ingestion.run(FULL);
    const before = await documents('properties-sync');

    const root = await mysql.createConnection(rootOptions);
    await root.query('UPDATE properties SET price = ? WHERE id = ?', [CHANGED_PRICE, CHANGED_ID]);
    await root.end();
    await sleep(PAST_THE_SECOND_MS);

    const changed = await ingestion.run({ mode: INGESTION_MODE.SINCE, since: bound(full) });
    const after = await documents('properties-sync');
    const nothing = await ingestion.run({ mode: INGESTION_MODE.SINCE, since: bound(changed) });

    expect(changed).toMatchObject({
      mode: INGESTION_MODE.SINCE,
      read: 1,
      written: 1,
      failed: 0,
      indexed: PROPERTY_IDS.length,
      embedding: { calls: 1 },
    });
    const updated = after.find((document) => document.id === String(CHANGED_ID));
    const previous = before.find((document) => document.id === String(CHANGED_ID));
    expect(updated?.price).toBe(CHANGED_PRICE);
    expect(updated?.text).toContain('£99,000');
    expect(Date.parse(updated?.updated_at ?? '')).toBeGreaterThan(
      Date.parse(previous?.updated_at ?? ''),
    );
    const others = (documents: IndexedProperty[]): IndexedProperty[] =>
      documents.filter((document) => document.id !== String(CHANGED_ID));
    expect(others(after)).toEqual(others(before));

    expect(nothing).toMatchObject({
      read: 0,
      written: 0,
      failed: 0,
      indexed: PROPERTY_IDS.length,
      embedding: { calls: 0, inputTokens: 0, costUsd: 0 },
    });
  });
});
