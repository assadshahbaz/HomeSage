import { errors } from '@elastic/elasticsearch';
import type { Client } from '@elastic/elasticsearch';
import { GatewayTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ZodError } from 'zod';
import type { SemanticSearchRequest } from '../../contracts/index.js';
import type { AppLogger } from '../../platform/logging/app-logger.js';
import type { EmbeddedQuery, EmbeddingService } from '../embeddings/embedding.service.js';
import { SemanticSearchService } from './semantic-search.service.js';

const INDEX = 'homesage-properties';
const VECTOR = [0.1, 0.2, 0.3];
const QUERY = 'cosy flat with a garden and a quiet street';
const REQUEST: SemanticSearchRequest = {
  query: QUERY,
  topK: 2,
  filters: { propertyKinds: ['residential'], hasGarden: true },
};

function source(id: string): Record<string, unknown> {
  return {
    id,
    text: `Property ${id}, Aberdeen.`,
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
    has_garden: true,
    has_garage: false,
    has_off_street_parking: false,
    is_new_build: false,
  };
}

function responseError(statusCode: number, type: string): errors.ResponseError {
  return new errors.ResponseError({
    statusCode,
    body: { error: { type } },
    headers: {},
    warnings: null,
    meta: {},
  } as unknown as ConstructorParameters<typeof errors.ResponseError>[0]);
}

function build(options: {
  embed?: () => Promise<EmbeddedQuery>;
  search?: () => Promise<unknown>;
}): {
  service: SemanticSearchService;
  embedQuery: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
} {
  const embedQuery = vi.fn(
    options.embed ??
      (() => Promise.resolve({ vector: VECTOR, usage: { calls: 1, inputTokens: 12, costUsd: 0 } })),
  );
  const search = vi.fn(
    options.search ??
      (() =>
        Promise.resolve({
          hits: {
            hits: [
              { _id: '3501', _score: 0.83, _source: source('3501') },
              { _id: '50', _score: 0.82, _source: source('50') },
            ],
          },
        })),
  );
  const log = vi.fn();
  const service = new SemanticSearchService(
    { embedQuery } as unknown as EmbeddingService,
    { search } as unknown as Client,
    { log } as unknown as AppLogger,
    { getOrThrow: () => ({ index: INDEX }) } as unknown as ConfigService,
  );
  return { service, embedQuery, search, log };
}

describe('SemanticSearchService', () => {
  it('embeds the query on the query side, then searches the index with that vector and the filters', async () => {
    const { service, embedQuery, search } = build({});

    await service.search(REQUEST);

    expect(embedQuery).toHaveBeenCalledWith(QUERY);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: INDEX,
        size: 2,
        knn: expect.objectContaining({
          query_vector: VECTOR,
          k: 2,
          filter: [{ terms: { property_kind: ['residential'] } }, { term: { has_garden: true } }],
        }) as unknown,
      }),
    );
  });

  it('returns the hits as result cards, nearest first, with whole millisecond timings', async () => {
    const { service } = build({});

    const outcome = await service.search(REQUEST);

    expect(outcome.results.map((result) => [result.id, result.score])).toEqual([
      ['3501', 0.83],
      ['50', 0.82],
    ]);
    const { embedMs, searchMs, totalMs } = outcome.timing;
    for (const ms of [embedMs, searchMs, totalMs]) {
      expect(Number.isInteger(ms)).toBe(true);
    }
    expect(totalMs).toBeGreaterThanOrEqual(embedMs + searchMs - 1);
  });

  it('logs the count, filters and timings, never the query text', async () => {
    const { service, log } = build({});

    await service.search(REQUEST);

    const [message, meta] = log.mock.calls[0] as [string, Record<string, unknown>];
    expect(meta).toMatchObject({ results: 2, topK: 2, filters: ['propertyKinds', 'hasGarden'] });
    expect(JSON.stringify([message, meta])).not.toContain('cosy');
  });

  it('rejects a hit of the wrong shape rather than passing it on', async () => {
    const { service } = build({
      search: () => Promise.resolve({ hits: { hits: [{ _score: 0.8, _source: { id: 1 } }] } }),
    });

    await expect(service.search(REQUEST)).rejects.toBeInstanceOf(ZodError);
  });

  it.each([
    ['refused', new errors.ConnectionError('connect ECONNREFUSED 127.0.0.1:9200')],
    ['too slow', new errors.TimeoutError('Request timed out')],
    ['failing on its side', responseError(503, 'cluster_block_exception')],
    ['without the index yet', responseError(404, 'index_not_found_exception')],
  ])('answers 503 when Elasticsearch is %s', async (_, error) => {
    const { service } = build({ search: () => Promise.reject(error) });

    const failure = await service.search(REQUEST).catch((thrown: unknown) => thrown);

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect(failure).toMatchObject({ message: 'Search is unavailable', cause: error });
  });

  it('lets any other Elasticsearch error through as it is', async () => {
    const error = responseError(400, 'parsing_exception');
    const { service } = build({ search: () => Promise.reject(error) });

    await expect(service.search(REQUEST)).rejects.toBe(error);
  });

  it.each([
    ['refused', new TypeError('fetch failed')],
    ['failing on its side', Object.assign(new Error('Ollama answered 500'), { status: 500 })],
  ])('answers 503 when the embedding model is %s', async (_, error) => {
    const { service, search } = build({ embed: () => Promise.reject(error) });

    const failure = await service.search(REQUEST).catch((thrown: unknown) => thrown);

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect(failure).toMatchObject({ message: 'The embedding model is unavailable', cause: error });
    expect(search).not.toHaveBeenCalled();
  });

  it.each([
    ['its own deadline, a 504', new GatewayTimeoutException('did not answer within 30000 ms')],
    ['a bad request', Object.assign(new Error('Ollama answered 400'), { status: 400 })],
  ])('lets an embedding failure through as it is: %s', async (_, error) => {
    const { service } = build({ embed: () => Promise.reject(error) });

    await expect(service.search(REQUEST)).rejects.toBe(error);
  });
});
