import { errors } from '@elastic/elasticsearch';
import type { Client } from '@elastic/elasticsearch';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ZodError } from 'zod';
import type { SemanticSearchRequest } from '../../contracts/index.js';
import type { AppLogger } from '../../platform/logging/app-logger.js';
import { KeywordSearchService } from './keyword-search.service.js';

const INDEX = 'homesage-properties';
const QUERY = 'detached bungalow on Larkfield Rise';
const REQUEST: SemanticSearchRequest = {
  query: QUERY,
  topK: 2,
  filters: { propertyKinds: ['residential'], hasGarden: true },
};

function source(id: string): Record<string, unknown> {
  return {
    id,
    text: `Detached bungalow at 20 Larkfield Rise, Aberdeen. Property ${id}.`,
    price: 229_000,
    bedrooms: 3,
    bathrooms: 2,
    public_rooms: 1,
    area_m2: 97,
    post_code: 'AB21 9CK',
    postcode_district: 'AB21',
    town: 'Aberdeen',
    council_tax_band: 'E',
    property_kind: 'residential',
    heating_type: 'gas',
    has_garden: true,
    has_garage: true,
    has_off_street_parking: true,
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

function build(search?: () => Promise<unknown>): {
  service: KeywordSearchService;
  search: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
} {
  const searchMock = vi.fn(
    search ??
      (() =>
        Promise.resolve({
          hits: {
            hits: [
              { _id: '1207', _score: 7.4, _source: source('1207') },
              { _id: '88', _score: 3.1, _source: source('88') },
            ],
          },
        })),
  );
  const log = vi.fn();
  const service = new KeywordSearchService(
    { search: searchMock } as unknown as Client,
    { log } as unknown as AppLogger,
    { getOrThrow: () => ({ index: INDEX }) } as unknown as ConfigService,
  );
  return { service, search: searchMock, log };
}

describe('KeywordSearchService', () => {
  it('searches the index with the BM25 match and the filters', async () => {
    const { service, search } = build();

    await service.search(REQUEST);

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: INDEX,
        size: 2,
        query: {
          bool: {
            must: [{ match: { text: { query: QUERY } } }],
            filter: [{ terms: { property_kind: ['residential'] } }, { term: { has_garden: true } }],
          },
        },
      }),
    );
  });

  it('returns the hits as result cards, best first, with their BM25 scores', async () => {
    const { service } = build();

    const outcome = await service.search(REQUEST);

    expect(outcome.results.map((result) => [result.id, result.score])).toEqual([
      ['1207', 7.4],
      ['88', 3.1],
    ]);
    expect(Number.isInteger(outcome.timing.searchMs)).toBe(true);
  });

  it('logs the count, filters and timing, never the query text', async () => {
    const { service, log } = build();

    await service.search(REQUEST);

    const [message, meta] = log.mock.calls[0] as [string, Record<string, unknown>];
    expect(meta).toMatchObject({ results: 2, topK: 2, filters: ['propertyKinds', 'hasGarden'] });
    expect(JSON.stringify([message, meta])).not.toContain('bungalow');
  });

  it('rejects a hit of the wrong shape rather than passing it on', async () => {
    const { service } = build(() =>
      Promise.resolve({ hits: { hits: [{ _score: 2, _source: { id: 1 } }] } }),
    );

    await expect(service.search(REQUEST)).rejects.toBeInstanceOf(ZodError);
  });

  it.each([
    ['refused', new errors.ConnectionError('connect ECONNREFUSED 127.0.0.1:9200')],
    ['too slow', new errors.TimeoutError('Request timed out')],
    ['failing on its side', responseError(503, 'cluster_block_exception')],
    ['without the index yet', responseError(404, 'index_not_found_exception')],
  ])('answers 503 when Elasticsearch is %s', async (_, error) => {
    const { service } = build(() => Promise.reject(error));

    const failure = await service.search(REQUEST).catch((thrown: unknown) => thrown);

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect(failure).toMatchObject({ message: 'Search is unavailable', cause: error });
  });

  it('lets any other Elasticsearch error through as it is', async () => {
    const error = responseError(400, 'parsing_exception');
    const { service } = build(() => Promise.reject(error));

    await expect(service.search(REQUEST)).rejects.toBe(error);
  });
});
