import type { Client } from '@elastic/elasticsearch';
import type { ConfigService } from '@nestjs/config';
import { PropertyIndex } from './property-index.js';
import type { IndexedProperty } from './property-index.js';
import { propertyIndexMapping } from './property-index-mapping.js';

const INDEX = 'homesage-properties';
const DIMENSIONS = 1536;
const OTHER_DIMENSIONS = 768;

function config(): ConfigService {
  const values: Record<string, unknown> = {
    elasticsearch: { index: INDEX },
    embeddings: { dimensions: DIMENSIONS },
  };
  return { getOrThrow: (key: string) => values[key] } as unknown as ConfigService;
}

function client(options: { exists: boolean; liveDimensions?: number }): {
  client: Client;
  create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn().mockResolvedValue({ acknowledged: true });
  const live = propertyIndexMapping(options.liveDimensions ?? DIMENSIONS);
  const indices = {
    exists: vi.fn().mockResolvedValue(options.exists),
    create,
    // Keyed by the concrete index name, as Elasticsearch answers.
    getMapping: vi.fn().mockResolvedValue({ [`${INDEX}-v1`]: { mappings: live } }),
  };
  return { client: { indices } as unknown as Client, create };
}

describe('PropertyIndex', () => {
  it('creates a missing index with the mapping, the vector size from config and one shard', async () => {
    const { client: es, create } = client({ exists: false });

    await expect(new PropertyIndex(es, config()).ensure()).resolves.toBe('created');
    expect(create).toHaveBeenCalledWith({
      index: INDEX,
      settings: { number_of_shards: 1, number_of_replicas: 0 },
      mappings: propertyIndexMapping(DIMENSIONS),
    });
  });

  it('leaves an existing index alone when its mapping matches', async () => {
    const { client: es, create } = client({ exists: true });

    await expect(new PropertyIndex(es, config()).ensure()).resolves.toBe('matched');
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an existing index built for another vector size, and says why', async () => {
    const { client: es, create } = client({ exists: true, liveDimensions: OTHER_DIMENSIONS });

    await expect(new PropertyIndex(es, config()).ensure()).rejects.toThrow(
      /"homesage-properties" does not match the property mapping: embedding\.dims is 768 in the index, expected 1536\. .*EMBED_DIMENSIONS is 1536.*Nothing was written/,
    );
    expect(create).not.toHaveBeenCalled();
  });
});

describe('PropertyIndex upsert', () => {
  const FIRST_ID = '1234';
  const SECOND_ID = '1235';

  function document(id: string): IndexedProperty {
    return { id, text: `Property ${id}.`, embedding: [0.1, 0.2] } as unknown as IndexedProperty;
  }

  function bulkClient(response: unknown): { client: Client; bulk: ReturnType<typeof vi.fn> } {
    const bulk = vi.fn().mockResolvedValue(response);
    return { client: { bulk } as unknown as Client, bulk };
  }

  it('writes each document under its property id, so a rerun replaces rather than adds', async () => {
    const { client: es, bulk } = bulkClient({ errors: false, items: [] });

    await expect(
      new PropertyIndex(es, config()).upsert([document(FIRST_ID), document(SECOND_ID)]),
    ).resolves.toEqual([]);
    expect(bulk).toHaveBeenCalledWith({
      operations: [
        { index: { _index: INDEX, _id: FIRST_ID } },
        document(FIRST_ID),
        { index: { _index: INDEX, _id: SECOND_ID } },
        document(SECOND_ID),
      ],
    });
  });

  it('returns the documents Elasticsearch refused, with the reason it gave', async () => {
    const { client: es } = bulkClient({
      errors: true,
      items: [
        { index: { _id: FIRST_ID, status: 201 } },
        {
          index: {
            _id: SECOND_ID,
            status: 400,
            error: { type: 'mapper_parsing_exception', reason: 'bad date' },
          },
        },
      ],
    });

    await expect(
      new PropertyIndex(es, config()).upsert([document(FIRST_ID), document(SECOND_ID)]),
    ).resolves.toEqual([{ id: SECOND_ID, reason: 'mapper_parsing_exception: bad date' }]);
  });

  it('sends nothing for an empty page', async () => {
    const { client: es, bulk } = bulkClient({ errors: false, items: [] });

    await expect(new PropertyIndex(es, config()).upsert([])).resolves.toEqual([]);
    expect(bulk).not.toHaveBeenCalled();
  });
});
