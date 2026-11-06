import type { SearchResult, SemanticSearchRequest } from '../../contracts/index.js';
import type { KeywordSearchOutcome, KeywordSearchService } from './keyword-search.service.js';
import { RetrievalService } from './retrieval.service.js';
import type { SemanticSearchOutcome, SemanticSearchService } from './semantic-search.service.js';

const REQUEST: SemanticSearchRequest = {
  query: 'quiet bungalow with a garden',
  topK: 8,
  filters: { propertyKinds: ['residential'], towns: ['Ellon'] },
};

function result(id: string, score: number): SearchResult {
  return {
    id,
    score,
    price: 180_000,
    bedrooms: 2,
    bathrooms: 1,
    publicRooms: 1,
    areaM2: 70,
    town: 'Ellon',
    postcodeDistrict: 'AB41',
    postCode: 'AB41 9CK',
    councilTaxBand: 'C',
    propertyKind: 'residential',
    heatingType: 'gas',
    hasGarden: true,
    hasGarage: false,
    hasOffStreetParking: false,
    isNewBuild: false,
    text: `Property ${id}, Ellon.`,
  };
}

const KNN: SemanticSearchOutcome = {
  results: [result('1342', 0.91), result('1207', 0.88)],
  timing: { embedMs: 30, searchMs: 12, totalMs: 42 },
};
const BM25: KeywordSearchOutcome = {
  results: [result('1388', 6.2), result('1342', 4.0)],
  timing: { searchMs: 9 },
};

function build(
  semanticSearch: () => Promise<SemanticSearchOutcome>,
  keywordSearch: () => Promise<KeywordSearchOutcome>,
): {
  service: RetrievalService;
  semantic: ReturnType<typeof vi.fn>;
  keyword: ReturnType<typeof vi.fn>;
} {
  const semantic = vi.fn(semanticSearch);
  const keyword = vi.fn(keywordSearch);
  const service = new RetrievalService(
    { search: semantic } as unknown as SemanticSearchService,
    { search: keyword } as unknown as KeywordSearchService,
  );
  return { service, semantic, keyword };
}

describe('RetrievalService', () => {
  it('returns the kNN and BM25 rankings apart, each in its own order with its own scores', async () => {
    const { service } = build(
      () => Promise.resolve(KNN),
      () => Promise.resolve(BM25),
    );

    const lists = await service.rankedLists(REQUEST);

    expect(lists.knn).toEqual(KNN.results);
    expect(lists.bm25).toEqual(BM25.results);
    expect(lists.timing).toMatchObject({ knnMs: 42, bm25Ms: 9 });
    expect(Number.isInteger(lists.timing.totalMs)).toBe(true);
  });

  it('gives both searches the same request, filters included', async () => {
    const { service, semantic, keyword } = build(
      () => Promise.resolve(KNN),
      () => Promise.resolve(BM25),
    );

    await service.rankedLists(REQUEST);

    expect(semantic).toHaveBeenCalledWith(REQUEST);
    expect(keyword).toHaveBeenCalledWith(REQUEST);
  });

  it('starts the keyword search without waiting for the semantic one', async () => {
    let finishSemantic: (outcome: SemanticSearchOutcome) => void = () => undefined;
    const { service, keyword } = build(
      () =>
        new Promise((resolve) => {
          finishSemantic = resolve;
        }),
      () => Promise.resolve(BM25),
    );

    const pending = service.rankedLists(REQUEST);

    expect(keyword).toHaveBeenCalledTimes(1);
    finishSemantic(KNN);
    await expect(pending).resolves.toMatchObject({ bm25: BM25.results });
  });

  it.each(['semantic', 'keyword'])('lets a %s failure reach the caller', async (failing) => {
    const error = new Error(`${failing} failed`);
    const { service } = build(
      () => (failing === 'semantic' ? Promise.reject(error) : Promise.resolve(KNN)),
      () => (failing === 'keyword' ? Promise.reject(error) : Promise.resolve(BM25)),
    );

    await expect(service.rankedLists(REQUEST)).rejects.toBe(error);
  });
});
