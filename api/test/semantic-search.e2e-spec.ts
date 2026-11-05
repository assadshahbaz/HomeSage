import { Client } from '@elastic/elasticsearch';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import { AppModule } from '../src/app.module.ts';
import { EMBEDDING_PROVIDER } from '../src/app/embeddings/embedding.symbol.ts';
import { PropertyIndex } from '../src/app/ingestion/search-index/property-index.ts';
import type { IndexedProperty } from '../src/app/ingestion/search-index/property-index.ts';
import { semanticSearchResponseSchema } from '../src/contracts/index.ts';
import type { SemanticSearchResponse } from '../src/contracts/index.ts';
import type { EmbeddingProvider, EmbeddingRequest } from '../src/core/embedding-provider.ts';
import { ELASTICSEARCH_CLIENT } from '../src/infra/elasticsearch/elasticsearch.symbol.ts';
import { AllExceptionsFilter } from '../src/platform/filters/all-exceptions.filter.ts';
import { AppLogger } from '../src/platform/logging/app-logger.ts';
import { RequestContextService } from '../src/platform/request-context/request-context.service.ts';
import { clearThrottleCounters } from './throttle-counters.ts';

// The image docker-compose.yml runs, so the test and the local stack agree.
const ES_IMAGE = 'elasticsearch:8.19.21';
const ES_PORT = 9200;
const STARTUP_TIMEOUT_MS = 300_000;
const QUERY = 'cosy flat with a garden and a quiet street';
const RATE_LIMIT = 2;
const DOWN_TEST_TIMEOUT_MS = 30_000;
const DOWN_ANSWER_WITHIN_MS = 15_000;

// The index is built for the configured model, so the stub vectors match it.
const DIMENSIONS = Number(process.env['EMBED_DIMENSIONS']);

/**
 * A unit vector at `angle` radians from the query's, so its cosine similarity
 * to the query is cos(angle): the smaller the angle, the nearer the document.
 */
function vectorAt(angle: number): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  vector[0] = Math.cos(angle);
  vector[1] = Math.sin(angle);
  return vector;
}

// Every query lands on the same point, so which documents are nearest is fixed.
const stubProvider: EmbeddingProvider = {
  embedDocuments: () => Promise.reject(new Error('not used')),
  embedQueries: (embedding: EmbeddingRequest) =>
    Promise.resolve({ vectors: embedding.texts.map(() => vectorAt(0)), inputTokens: 1 }),
  retryAfterMs: () => null,
};

function property(
  id: number,
  angle: number,
  facts: Partial<IndexedProperty> = {},
): IndexedProperty {
  return {
    id: String(id),
    text: `Property ${String(id)}, Aberdeen.`,
    price: 150_000,
    bedrooms: 2,
    bathrooms: 1,
    public_rooms: 1,
    area_m2: 70,
    post_code: 'AB24 5CV',
    postcode_district: 'AB24',
    town: 'Aberdeen',
    council_tax_band: 'C',
    property_kind: 'residential',
    heating_type: 'gas',
    has_garden: false,
    has_garage: false,
    has_off_street_parking: false,
    is_new_build: false,
    updated_at: '2026-09-26T10:58:48.000Z',
    embedding: vectorAt(angle),
    ...facts,
  };
}

// Nearest first: a plot, then two homes without gardens, then three with.
const SEEDED = [
  property(9003, 0.05, { property_kind: 'plot', has_garden: true }),
  property(9001, 0.1),
  property(9002, 0.2),
  property(9004, 0.6, { has_garden: true }),
  property(9005, 0.7, { has_garden: true, price: 250_000 }),
  property(9006, 0.8, { has_garden: true, town: 'Ellon', postcode_district: 'AB41' }),
];

/**
 * `POST /search/semantic` through the real `AppModule`, against Elasticsearch
 * in its own container with a seeded index built by `PropertyIndex`, so the
 * mapping is the one ingestion writes. Only the embedding model is a stub.
 * Needs Docker, and Redis from the local stack for the rate limit.
 */
describe('POST /search/semantic', () => {
  let container: StartedTestContainer;
  let esUrl: string;

  async function startApp(): Promise<INestApplication> {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue(stubProvider)
      // A client per app: each app closes its own on shutdown.
      .overrideProvider(ELASTICSEARCH_CLIENT)
      .useValue(new Client({ node: esUrl }))
      .compile();
    const app = testingModule.createNestApplication();
    const logger = app.get(AppLogger);
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(logger, level).mockImplementation(() => undefined);
    }
    // The same wiring main.ts does.
    app.useGlobalFilters(new AllExceptionsFilter(logger, app.get(RequestContextService)));
    await app.init();
    await clearThrottleCounters(app);
    return app;
  }

  function search(app: INestApplication, body: object): request.Test {
    return request(app.getHttpServer()).post('/search/semantic').send(body);
  }

  // Parsed with the contract, so these tests also prove the endpoint sends its declared shape.
  function idsFrom(response: request.Response): string[] {
    const body: SemanticSearchResponse = semanticSearchResponseSchema.parse(response.body);
    return body.results.map((result) => result.id);
  }

  beforeAll(async () => {
    container = await new GenericContainer(ES_IMAGE)
      .withEnvironment({
        'discovery.type': 'single-node',
        'xpack.security.enabled': 'false',
        ES_JAVA_OPTS: '-Xms512m -Xmx512m',
      })
      .withExposedPorts(ES_PORT)
      .withWaitStrategy(Wait.forHttp('/_cluster/health?wait_for_status=green&timeout=30s', ES_PORT))
      .withStartupTimeout(STARTUP_TIMEOUT_MS)
      .start();
    esUrl = `http://${container.getHost()}:${String(container.getMappedPort(ES_PORT))}`;
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await container.stop();
  });

  describe('searching', () => {
    let app: INestApplication;

    beforeAll(async () => {
      // This block makes more requests than the default limit allows in a minute.
      process.env['THROTTLE_LIMIT'] = '1000';
      app = await startApp();
      const index = app.get(PropertyIndex);
      await index.ensure();
      expect(await index.upsert(SEEDED)).toEqual([]);
      await index.refresh();
    });

    afterAll(async () => {
      await app.close();
      delete process.env['THROTTLE_LIMIT'];
    });

    it('answers with the nearest homes, nearest first, in the contract shape, with timings', async () => {
      const response = await search(app, { query: QUERY, topK: 3 });

      expect(response.status).toBe(200);
      expect(idsFrom(response)).toEqual(['9001', '9002', '9004']);
      const body = semanticSearchResponseSchema.parse(response.body);
      expect(body).toMatchObject({
        query: QUERY,
        topK: 3,
        filters: { propertyKinds: ['residential'] },
      });
      expect(body.results[0]).toMatchObject({ id: '9001', town: 'Aberdeen', hasGarden: false });
      expect(body.results[0]?.score).toBeGreaterThan(body.results[1]?.score ?? 1);
      expect(response.body).not.toHaveProperty('results.0.embedding');
      expect(body.timing.totalMs).toBeGreaterThanOrEqual(0);
    });

    it('applies filters inside the search, so the nearest non matches never crowd out the matches', async () => {
      // The three nearest documents have no garden or are a plot. A search that
      // took the nearest two and filtered afterwards would return nothing.
      const response = await search(app, { query: QUERY, topK: 2, filters: { hasGarden: true } });

      expect(idsFrom(response)).toEqual(['9004', '9005']);
    });

    it('leaves out plots unless the request asks for them', async () => {
      const residential = await search(app, { query: QUERY, topK: 1 });
      const plots = await search(app, {
        query: QUERY,
        topK: 1,
        filters: { propertyKinds: ['plot'] },
      });

      expect(idsFrom(residential)).toEqual(['9001']);
      expect(idsFrom(plots)).toEqual(['9003']);
    });

    it.each([
      ['a town, ignoring case', { towns: ['ellon'] }, ['9006']],
      ['a district, in any case', { postcodeDistricts: ['ab41'] }, ['9006']],
      ['a price ceiling with a garden', { hasGarden: true, maxPrice: 200_000 }, ['9004', '9006']],
      ['a filter nothing matches', { councilTaxBands: ['H'] }, []],
    ])('filters on %s', async (_, filters, expected) => {
      expect(idsFrom(await search(app, { query: QUERY, topK: 5, filters }))).toEqual(expected);
    });

    it.each([
      ['no query', {}, 'query'],
      ['an empty query', { query: '  ' }, 'query'],
      ['a topK over the cap', { query: QUERY, topK: 21 }, 'topK'],
      [
        'a flag filtered on false',
        { query: QUERY, filters: { hasGarden: false } },
        'filters.hasGarden',
      ],
      [
        'a minimum price above the maximum',
        { query: QUERY, filters: { minPrice: 300_000, maxPrice: 100_000 } },
        'filters.minPrice',
      ],
      ['an unknown filter', { query: QUERY, filters: { nearUniversity: true } }, 'filters'],
    ])('refuses %s with a 400 naming the field', async (_, body, path) => {
      const response = await search(app, body);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        statusCode: 400,
        message: 'Request validation failed',
      });
      const paths = (response.body as { issues: { path: string }[] }).issues.map(
        (issue) => issue.path,
      );
      expect(paths).toContain(path);
    });
  });

  describe('rate limiting', () => {
    let app: INestApplication;

    beforeAll(async () => {
      process.env['THROTTLE_LIMIT'] = String(RATE_LIMIT);
      app = await startApp();
    });

    afterAll(async () => {
      await clearThrottleCounters(app);
      await app.close();
      delete process.env['THROTTLE_LIMIT'];
    });

    it('answers 429 with Retry-After once a caller passes the limit', async () => {
      for (let call = 0; call < RATE_LIMIT; call++) {
        expect((await search(app, { query: QUERY })).status).toBe(200);
      }

      const refused = await search(app, { query: QUERY });

      expect(refused.status).toBe(429);
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  // Last, since it stops the container.
  describe('with Elasticsearch down', () => {
    let app: INestApplication;

    beforeAll(async () => {
      process.env['THROTTLE_LIMIT'] = '1000';
      app = await startApp();
      await container.stop();
    });

    afterAll(async () => {
      await app.close();
      delete process.env['THROTTLE_LIMIT'];
    });

    // A stopped container's port may accept and hang rather than refuse, so the
    // answer waits out one ES_REQUEST_TIMEOUT_MS and a retry (about 7 s here).
    // Failing fast during an outage is the circuit breaker's job, not this one's.
    it(
      'answers 503 without any Elasticsearch detail',
      { timeout: DOWN_TEST_TIMEOUT_MS },
      async () => {
        const startedAt = Date.now();
        const response = await search(app, { query: QUERY });

        expect(response.status).toBe(503);
        expect(response.body).toMatchObject({ statusCode: 503, message: 'Search is unavailable' });
        expect(JSON.stringify(response.body)).not.toMatch(/ECONNREFUSED|9200|elasticsearch/i);
        expect(Date.now() - startedAt).toBeLessThan(DOWN_ANSWER_WITHIN_MS);
      },
    );
  });
});
