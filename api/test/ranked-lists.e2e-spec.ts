import { Client } from '@elastic/elasticsearch';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import { AppModule } from '../src/app.module.ts';
import { EMBEDDING_PROVIDER } from '../src/app/embeddings/embedding.symbol.ts';
import { PropertyIndex } from '../src/app/ingestion/search-index/property-index.ts';
import type { IndexedProperty } from '../src/app/ingestion/search-index/property-index.ts';
import { RetrievalService } from '../src/app/retrieval/retrieval.service.ts';
import type { RankedLists } from '../src/app/retrieval/retrieval.service.ts';
import { semanticSearchRequestSchema } from '../src/contracts/index.ts';
import type { EmbeddingProvider, EmbeddingRequest } from '../src/core/embedding-provider.ts';
import { ELASTICSEARCH_CLIENT } from '../src/infra/elasticsearch/elasticsearch.symbol.ts';
import { AppLogger } from '../src/platform/logging/app-logger.ts';

// The image docker-compose.yml runs, so the test and the local stack agree.
const ES_IMAGE = 'elasticsearch:8.19.21';
const ES_PORT = 9200;
const STARTUP_TIMEOUT_MS = 300_000;

// The index is built for the configured model, so the stub vectors match it.
const DIMENSIONS = Number(process.env['EMBED_DIMENSIONS']);

/** A unit vector at `angle` radians from the query's: the smaller the angle, the nearer. */
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

function property(id: number, angle: number, facts: Partial<IndexedProperty>): IndexedProperty {
  return {
    id: String(id),
    text: `2 bedroom flat at ${String(id)} Thornbury Street, Aberdeen AB10 1CK.`,
    price: 150_000,
    bedrooms: 2,
    bathrooms: 1,
    public_rooms: 1,
    area_m2: 70,
    post_code: 'AB10 1CK',
    postcode_district: 'AB10',
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

const BUNGALOW_TEXT = '3 bedroom bungalow at 4 Ospreyfield Lane, Ellon AB41 9CK. Garden.';

// Three flats sit nearest the query. The bungalow in Ellon is the only document
// that says "bungalow", and the farthest of all, so kNN for a top 3 misses it.
// A second bungalow is a plot, which the default filters leave out of both lists.
const SEEDED = [
  property(9101, 0.1, {}),
  property(9102, 0.2, {}),
  property(9103, 0.3, {}),
  property(9104, 1.4, {
    text: BUNGALOW_TEXT,
    town: 'Ellon',
    postcode_district: 'AB41',
    has_garden: true,
  }),
  property(9105, 0.05, {
    text: 'Plot with consent for a bungalow, Ellon AB41 9KV.',
    property_kind: 'plot',
    town: 'Ellon',
    postcode_district: 'AB41',
  }),
];

function ids(results: RankedLists['knn']): string[] {
  return results.map((result) => result.id);
}

/**
 * `RetrievalService` through the real `AppModule`, against Elasticsearch in
 * its own container with an index built by `PropertyIndex`, so the mapping and
 * analyzer are the ones ingestion writes. Only the embedding model is a stub.
 * Needs Docker, and Redis from the local stack, which the app connects to on boot.
 */
describe('RetrievalService ranked lists', () => {
  let container: StartedTestContainer;
  let app: INestApplication;
  let retrieval: RetrievalService;

  function rankedLists(body: object): Promise<RankedLists> {
    return retrieval.rankedLists(semanticSearchRequestSchema.parse(body));
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
    const esUrl = `http://${container.getHost()}:${String(container.getMappedPort(ES_PORT))}`;

    const testingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue(stubProvider)
      .overrideProvider(ELASTICSEARCH_CLIENT)
      .useValue(new Client({ node: esUrl }))
      .compile();
    app = testingModule.createNestApplication();
    const logger = app.get(AppLogger);
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(logger, level).mockImplementation(() => undefined);
    }
    await app.init();
    retrieval = app.get(RetrievalService);

    const index = app.get(PropertyIndex);
    await index.ensure();
    expect(await index.upsert(SEEDED)).toEqual([]);
    await index.refresh();
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('finds a keyword only match with BM25 that kNN misses', async () => {
    const lists = await rankedLists({ query: 'bungalow', topK: 3 });

    expect(ids(lists.knn)).toEqual(['9101', '9102', '9103']);
    expect(ids(lists.bm25)).toEqual(['9104']);
    expect(lists.bm25[0]).toMatchObject({ town: 'Ellon', hasGarden: true, text: BUNGALOW_TEXT });
    expect(lists.bm25[0]?.score).toBeGreaterThan(0);
  });

  it('ranks BM25 by how well the words match, with its own scores', async () => {
    // Any of the words can match, so every residential document comes back.
    const lists = await rankedLists({ query: 'bungalow Thornbury Street', topK: 5 });

    expect(ids(lists.bm25).sort()).toEqual(['9101', '9102', '9103', '9104']);
    const scores = lists.bm25.map((result) => result.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('leaves plots out of both lists unless the filters ask for them', async () => {
    const residential = await rankedLists({ query: 'bungalow', topK: 5 });
    const plots = await rankedLists({
      query: 'bungalow',
      topK: 5,
      filters: { propertyKinds: ['plot'] },
    });

    expect([...ids(residential.knn), ...ids(residential.bm25)]).not.toContain('9105');
    expect(ids(plots.knn)).toEqual(['9105']);
    expect(ids(plots.bm25)).toEqual(['9105']);
  });

  it('applies the same filters to both lists', async () => {
    const lists = await rankedLists({
      query: 'bungalow Thornbury Street',
      topK: 5,
      filters: { towns: ['ellon'], hasGarden: true },
    });

    expect(ids(lists.knn)).toEqual(['9104']);
    expect(ids(lists.bm25)).toEqual(['9104']);
  });

  it('never returns the stored vectors', async () => {
    const lists = await rankedLists({ query: 'bungalow', topK: 5 });

    for (const result of [...lists.knn, ...lists.bm25]) {
      expect(result).not.toHaveProperty('embedding');
    }
  });
});
