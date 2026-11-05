import type { estypes } from '@elastic/elasticsearch';
import { mappingDifferences } from './mapping-differences.js';

const DIMENSIONS = 1536;
const OTHER_DIMENSIONS = 768;

const EXPECTED: estypes.MappingTypeMapping = {
  dynamic: 'strict',
  properties: {
    id: { type: 'keyword' },
    price: { type: 'integer' },
    embedding: {
      type: 'dense_vector',
      dims: DIMENSIONS,
      index: true,
      similarity: 'cosine',
      index_options: { type: 'hnsw' },
    },
  },
};

// What Elasticsearch hands back for EXPECTED: the same, plus defaults it fills in.
function live(
  changes: (mapping: estypes.MappingTypeMapping) => void = () => undefined,
): estypes.MappingTypeMapping {
  const mapping: estypes.MappingTypeMapping = {
    dynamic: 'strict',
    properties: {
      id: { type: 'keyword' },
      price: { type: 'integer' },
      embedding: {
        type: 'dense_vector',
        dims: DIMENSIONS,
        index: true,
        similarity: 'cosine',
        index_options: { type: 'hnsw', m: 16, ef_construction: 100 },
      },
    },
  };
  changes(mapping);
  return mapping;
}

function embedding(mapping: estypes.MappingTypeMapping): estypes.MappingDenseVectorProperty {
  return mapping.properties?.['embedding'] as estypes.MappingDenseVectorProperty;
}

describe('mappingDifferences', () => {
  it('finds nothing when the live mapping only adds defaults of its own', () => {
    expect(mappingDifferences(EXPECTED, live())).toEqual([]);
  });

  it('names a different vector size', () => {
    expect(
      mappingDifferences(
        EXPECTED,
        live((mapping) => {
          embedding(mapping).dims = OTHER_DIMENSIONS;
        }),
      ),
    ).toEqual(['embedding.dims is 768 in the index, expected 1536']);
  });

  it('names a different setting nested inside a field', () => {
    expect(
      mappingDifferences(
        EXPECTED,
        live((mapping) => {
          embedding(mapping).index_options = { type: 'int8_hnsw' };
        }),
      ),
    ).toEqual(['embedding.index_options.type is "int8_hnsw" in the index, expected "hnsw"']);
  });

  it('names a field whose type changed', () => {
    expect(
      mappingDifferences(
        EXPECTED,
        live((mapping) => {
          const properties = mapping.properties ?? {};
          properties['price'] = { type: 'long' };
        }),
      ),
    ).toEqual(['price.type is "long" in the index, expected "integer"']);
  });

  it('names a field missing from the index and one the mapping does not have', () => {
    expect(
      mappingDifferences(
        EXPECTED,
        live((mapping) => {
          const properties = mapping.properties ?? {};
          delete properties['price'];
          properties['asking_price'] = { type: 'integer' };
        }),
      ),
    ).toEqual([
      'price is missing from the index',
      'asking_price is in the index but not in the mapping',
    ]);
  });

  it('names an index that would accept unmapped fields', () => {
    expect(
      mappingDifferences(
        EXPECTED,
        live((mapping) => {
          delete mapping.dynamic;
        }),
      ),
    ).toEqual(['dynamic is not set in the index, expected "strict"']);
  });

  it('treats a setting returned as a string as equal to the number', () => {
    expect(
      mappingDifferences(
        EXPECTED,
        live((mapping) => {
          (embedding(mapping) as unknown as Record<string, unknown>)['dims'] = String(DIMENSIONS);
        }),
      ),
    ).toEqual([]);
  });
});
