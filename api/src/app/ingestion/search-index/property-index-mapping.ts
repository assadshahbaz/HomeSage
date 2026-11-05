import type { estypes } from '@elastic/elasticsearch';
import type { PropertyDocument } from '../document/property-document.js';

/** Every field in the index: the document's own, plus the vector ingestion adds. */
export type PropertyIndexField = keyof PropertyDocument | 'embedding';

// One node holds a few thousand documents, so one shard and no replicas. A
// replica could never be assigned on a single node and would keep the index yellow.
const SHARDS = 1;
const REPLICAS = 0;

/**
 * The property index mapping for a given vector size. `dynamic: strict` makes
 * Elasticsearch refuse a document carrying a field that is not mapped here, so
 * a builder change without a mapping change fails loudly instead of being
 * guessed. The text field keeps the standard analyzer: an English analyzer
 * would drop "no" and "not" as stop words, and "No structural damage reported"
 * would then match a search for structural damage.
 */
export function propertyIndexMapping(dimensions: number): estypes.MappingTypeMapping {
  const properties: Record<PropertyIndexField, estypes.MappingProperty> = {
    id: { type: 'keyword' },
    text: { type: 'text' },
    embedding: {
      type: 'dense_vector',
      dims: dimensions,
      index: true,
      similarity: 'cosine',
      // Plain HNSW over full floats. The default quantises to int8, which saves
      // memory this index does not need and costs recall it does.
      index_options: { type: 'hnsw' },
    },
    price: { type: 'integer' },
    bedrooms: { type: 'integer' },
    bathrooms: { type: 'integer' },
    public_rooms: { type: 'integer' },
    area_m2: { type: 'integer' },
    post_code: { type: 'keyword' },
    postcode_district: { type: 'keyword' },
    town: { type: 'keyword' },
    council_tax_band: { type: 'keyword' },
    property_kind: { type: 'keyword' },
    heating_type: { type: 'keyword' },
    has_garden: { type: 'boolean' },
    has_garage: { type: 'boolean' },
    has_off_street_parking: { type: 'boolean' },
    is_new_build: { type: 'boolean' },
    updated_at: { type: 'date' },
  };
  return { dynamic: 'strict', properties };
}

/** Index settings for a single node. */
export const PROPERTY_INDEX_SETTINGS: estypes.IndicesIndexSettings = {
  number_of_shards: SHARDS,
  number_of_replicas: REPLICAS,
};
