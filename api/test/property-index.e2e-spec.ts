import { Client } from '@elastic/elasticsearch';
import type { ConfigService } from '@nestjs/config';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import { mappingDifferences } from '../src/app/ingestion/search-index/mapping-differences.ts';
import { PropertyIndex } from '../src/app/ingestion/search-index/property-index.ts';
import { propertyIndexMapping } from '../src/app/ingestion/search-index/property-index-mapping.ts';

// The image docker-compose.yml runs, so the test and the local stack agree.
const IMAGE = 'elasticsearch:8.19.21';
const HTTP_PORT = 9200;
const INDEX = 'properties-under-test';
const DIMENSIONS = 1536;
const OTHER_DIMENSIONS = 768;
// Pulling the image and starting the JVM takes a while on a cold machine.
const STARTUP_TIMEOUT_MS = 240_000;

function config(dimensions: number): ConfigService {
  const values: Record<string, unknown> = {
    elasticsearch: { index: INDEX },
    embeddings: { dimensions },
  };
  return { getOrThrow: (key: string) => values[key] } as unknown as ConfigService;
}

/**
 * Runs the property index against a real Elasticsearch in its own container,
 * so it needs Docker but not the compose stack.
 */
describe('PropertyIndex against Elasticsearch', () => {
  let container: StartedTestContainer;
  let client: Client;

  beforeAll(async () => {
    container = await new GenericContainer(IMAGE)
      .withEnvironment({
        'discovery.type': 'single-node',
        'xpack.security.enabled': 'false',
        ES_JAVA_OPTS: '-Xms512m -Xmx512m',
      })
      .withExposedPorts(HTTP_PORT)
      .withWaitStrategy(
        Wait.forHttp('/_cluster/health?wait_for_status=green&timeout=30s', HTTP_PORT),
      )
      .withStartupTimeout(STARTUP_TIMEOUT_MS)
      .start();
    client = new Client({
      node: `http://${container.getHost()}:${String(container.getMappedPort(HTTP_PORT))}`,
    });
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await client.close();
    await container.stop();
  });

  it('creates the index on a clean cluster, and reads back the mapping it asked for', async () => {
    await expect(new PropertyIndex(client, config(DIMENSIONS)).ensure()).resolves.toBe('created');

    const response = await client.indices.getMapping({ index: INDEX });
    const live = response[INDEX].mappings;
    expect(mappingDifferences(propertyIndexMapping(DIMENSIONS), live)).toEqual([]);
    expect(live.properties?.['embedding']).toMatchObject({
      dims: DIMENSIONS,
      similarity: 'cosine',
      index_options: { type: 'hnsw' },
    });

    const health = await client.cluster.health({ index: INDEX });
    expect(health.status).toBe('green');
  });

  it('matches the same index on a second run, without changing it', async () => {
    await expect(new PropertyIndex(client, config(DIMENSIONS)).ensure()).resolves.toBe('matched');
  });

  it('refuses a document carrying a field the mapping does not have', async () => {
    await expect(
      client.index({ index: INDEX, id: '1234', document: { id: '1234', listing_date: 'today' } }),
    ).rejects.toThrow(/strict_dynamic_mapping_exception/);
  });

  it('refuses the index when config asks for another vector size, and leaves it as it was', async () => {
    await expect(new PropertyIndex(client, config(OTHER_DIMENSIONS)).ensure()).rejects.toThrow(
      'embedding.dims is 1536 in the index, expected 768',
    );

    const response = await client.indices.getMapping({ index: INDEX });
    expect(response[INDEX].mappings.properties?.['embedding']).toMatchObject({
      dims: DIMENSIONS,
    });
  });
});
