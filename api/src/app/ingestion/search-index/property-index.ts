import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Client } from '@elastic/elasticsearch';
import type { ElasticsearchConfig } from '../../../infra/config/elasticsearch.config.js';
import type { EmbeddingsConfig } from '../../../infra/config/embeddings.config.js';
import { ELASTICSEARCH_CLIENT } from '../../../infra/elasticsearch/elasticsearch.symbol.js';
import type { PropertyDocument } from '../document/property-document.js';
import { mappingDifferences } from './mapping-differences.js';
import { PROPERTY_INDEX_SETTINGS, propertyIndexMapping } from './property-index-mapping.js';

/** What `ensure` found. */
export type PropertyIndexState = 'created' | 'matched';

/** A property document with its vector, exactly as it is stored. */
export type IndexedProperty = PropertyDocument & { readonly embedding: readonly number[] };

/** A document Elasticsearch refused, and why. */
export interface UpsertFailure {
  readonly id: string;
  readonly reason: string;
}

/**
 * The property index in Elasticsearch, named by `ES_INDEX`, with its vector
 * size from `EMBED_DIMENSIONS`. The mapping is code, so the index can be
 * dropped and recreated from it and MySQL at any time.
 */
@Injectable()
export class PropertyIndex {
  public readonly name: string;
  private readonly dimensions: number;

  public constructor(
    @Inject(ELASTICSEARCH_CLIENT) private readonly client: Client,
    configService: ConfigService,
  ) {
    this.name = configService.getOrThrow<ElasticsearchConfig>('elasticsearch').index;
    this.dimensions = configService.getOrThrow<EmbeddingsConfig>('embeddings').dimensions;
  }

  /**
   * Creates the index when it is missing. When it exists, checks its live
   * mapping against the code's and throws on any difference, so nothing is
   * ever written into an index whose vectors or fields mean something else.
   * An index is never changed in place: a new mapping means a rebuild.
   */
  public async ensure(): Promise<PropertyIndexState> {
    const mapping = propertyIndexMapping(this.dimensions);
    if (!(await this.client.indices.exists({ index: this.name }))) {
      await this.client.indices.create({
        index: this.name,
        settings: PROPERTY_INDEX_SETTINGS,
        mappings: mapping,
      });
      return 'created';
    }

    const response = await this.client.indices.getMapping({ index: this.name });
    // Keyed by the concrete index name, which differs from `name` once that is an alias.
    const live = Object.values(response)[0]?.mappings ?? {};
    const differences = mappingDifferences(mapping, live);
    if (differences.length > 0) {
      const dimensions = differences.some((difference) => difference.startsWith('embedding.dims'))
        ? ` It was built for vectors of another size, and EMBED_DIMENSIONS is ${String(this.dimensions)}, so this model's vectors cannot go into it or search it.`
        : '';
      throw new Error(
        `Elasticsearch index "${this.name}" does not match the property mapping: ${differences.join('; ')}.${dimensions} Nothing was written. The index is derived from MySQL, so delete it and run a full ingestion to rebuild it.`,
      );
    }
    return 'matched';
  }

  /**
   * Writes documents in one bulk request, each under its property id as `_id`,
   * so writing a property again replaces it rather than adding a second copy.
   * Returns the documents Elasticsearch refused one by one; a request that
   * fails as a whole, such as the cluster being unreachable, throws.
   */
  public async upsert(documents: readonly IndexedProperty[]): Promise<UpsertFailure[]> {
    if (documents.length === 0) {
      return [];
    }
    const response = await this.client.bulk({
      operations: documents.flatMap((document) => [
        { index: { _index: this.name, _id: document.id } },
        document,
      ]),
    });
    if (!response.errors) {
      return [];
    }
    return response.items.flatMap((item) => {
      const result = item.index;
      return result?.error
        ? [
            {
              id: result._id ?? 'unknown id',
              reason: `${result.error.type}: ${result.error.reason ?? ''}`,
            },
          ]
        : [];
    });
  }

  /** Makes everything written so far visible to search and to `count`. */
  public async refresh(): Promise<void> {
    await this.client.indices.refresh({ index: this.name });
  }

  /** How many documents the index holds. */
  public async count(): Promise<number> {
    return (await this.client.count({ index: this.name })).count;
  }
}
