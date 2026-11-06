import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PropertySummary, SearchResult } from '../../contracts/index.js';
import type { AppLogger } from '../../platform/logging/app-logger.js';
import type { Route } from '../router/route.js';
import type { SqlQueryResult } from '../sql/sql-query-result.js';
import type { SqlQueryService } from '../sql/sql-query.service.js';
import type { ValidatedSql } from '../sql/validation/sql-validation-result.js';
import { HybridRetrievalService } from './hybrid-retrieval.service.js';
import type { KeywordSearchService } from './keyword-search.service.js';
import type { PropertyCardReader } from './properties/property-card-reader.js';
import type { PropertyDisclosureReader } from './properties/property-disclosure-reader.js';
import type { SemanticSearchService } from './semantic-search.service.js';

const BRANCH_TIMEOUT_MS = 15_000;
const QUESTION = 'a quiet 3 bed family home in Inverurie under £250k';
const SQL = 'SELECT p.id FROM properties p LIMIT 50' as ValidatedSql;

// Real listing ids in the format production uses.
const P1207 = '1207';
const P1342 = '1342';
const P1388 = '1388';
const P2537 = '2537';
const P50 = '50';

const ROUTE: Route = {
  intent: 'hybrid',
  filters: { propertyKinds: ['residential'], towns: ['Inverurie'], maxPrice: 250_000 },
  semanticQuery: 'quiet family home',
  standaloneQuestion: QUESTION,
  propertyIds: [],
  fallback: null,
};

function hit(id: string, score: number): SearchResult {
  return {
    id,
    score,
    price: 240_000,
    bedrooms: 3,
    bathrooms: 1,
    publicRooms: 1,
    areaM2: 90,
    town: 'Inverurie',
    postcodeDistrict: 'AB51',
    postCode: 'AB51 3CV',
    councilTaxBand: 'D',
    propertyKind: 'residential',
    heatingType: 'gas',
    hasGarden: true,
    hasGarage: false,
    hasOffStreetParking: false,
    isNewBuild: false,
    text: `Property ${id}, Inverurie.`,
  };
}

function card(id: string): PropertySummary {
  return {
    id,
    address: `${id} High Street, Inverurie, AB51 3CV`,
    price: 240_000,
    bedrooms: 3,
    bathrooms: 1,
    publicRooms: 1,
    areaM2: 90,
    town: 'Inverurie',
    postcodeDistrict: 'AB51',
    councilTaxBand: 'D',
    heatingType: 'gas',
    hasGarden: true,
    hasGarage: false,
    hasDoubleGarage: false,
    hasOffStreetParking: false,
    hasLand: false,
    hasGroundFloorBedroomBathroom: false,
    hasGrannyFlat: false,
    hasGreenEnergy: false,
    hasElectricVehicleChargePoint: false,
    isNewBuild: false,
  };
}

function rows(...ids: string[]): SqlQueryResult {
  return {
    status: 'answered',
    sql: SQL,
    answer: {
      kind: 'rows',
      rows: ids.map((id) => ({ id: Number(id), price: 240_000 })),
      ordered: false,
    },
    corrected: false,
  };
}

/** Rows the SQL put in the order the question asked for, such as cheapest first. */
function orderedRows(...ids: string[]): SqlQueryResult {
  const result = rows(...ids);
  return result.status === 'answered' && result.answer.kind === 'rows'
    ? { ...result, answer: { ...result.answer, ordered: true } }
    : result;
}

interface Fakes {
  sql?: () => Promise<SqlQueryResult>;
  knn?: () => Promise<SearchResult[]>;
  bm25?: () => Promise<SearchResult[]>;
  missingCards?: string[];
  cards?: Record<string, Partial<PropertySummary>>;
  disclosed?: string[];
}

function build(fakes: Fakes = {}): {
  service: HybridRetrievalService;
  run: ReturnType<typeof vi.fn>;
  semantic: ReturnType<typeof vi.fn>;
  keyword: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  readDisclosures: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
} {
  const run = vi.fn(fakes.sql ?? (() => Promise.resolve(rows(P1207, P1342))));
  const semantic = vi.fn(async () => ({
    results: await (fakes.knn ?? (() => Promise.resolve([hit(P1342, 0.91), hit(P1388, 0.88)])))(),
    timing: { embedMs: 1, searchMs: 1, totalMs: 2 },
  }));
  const keyword = vi.fn(async () => ({
    results: await (fakes.bm25 ?? (() => Promise.resolve([hit(P2537, 7.1), hit(P1342, 5.4)])))(),
    timing: { searchMs: 1 },
  }));
  const read = vi.fn((ids: string[]) =>
    Promise.resolve(
      ids
        .filter((id) => !(fakes.missingCards ?? []).includes(id))
        .map((id) => ({
          card: { ...card(id), ...fakes.cards?.[id] },
          kind: 'residential' as const,
        })),
    ),
  );
  const readDisclosures = vi.fn((ids: string[]) =>
    Promise.resolve(
      new Map(
        ids
          .filter((id) => (fakes.disclosed ?? []).includes(id))
          .map((id) => [id, { property_id: Number(id), asbestos: 'no' }]),
      ),
    ),
  );
  const log = vi.fn();
  const warn = vi.fn();
  const service = new HybridRetrievalService(
    { run } as unknown as SqlQueryService,
    { search: semantic } as unknown as SemanticSearchService,
    { search: keyword } as unknown as KeywordSearchService,
    { read } as unknown as PropertyCardReader,
    { read: readDisclosures } as unknown as PropertyDisclosureReader,
    { log, warn } as unknown as AppLogger,
    { getOrThrow: () => ({ branchTimeoutMs: BRANCH_TIMEOUT_MS }) } as unknown as ConfigService,
  );
  return { service, run, semantic, keyword, read, readDisclosures, log, warn };
}

function idsOf(retrieval: { properties: { property: PropertySummary }[] }): string[] {
  return retrieval.properties.map((entry) => entry.property.id);
}

describe('HybridRetrievalService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('choosing branches by intent', () => {
    it.each([
      ['structured', { sql: 1, knn: 0, bm25: 0 }],
      ['semantic', { sql: 0, knn: 1, bm25: 1 }],
      ['hybrid', { sql: 1, knn: 1, bm25: 1 }],
      ['out_of_scope', { sql: 0, knn: 0, bm25: 0 }],
    ] as const)('runs the branches a %s question needs', async (intent, calls) => {
      const { service, run, semantic, keyword } = build();

      await service.retrieve({ ...ROUTE, intent });

      expect(run).toHaveBeenCalledTimes(calls.sql);
      expect(semantic).toHaveBeenCalledTimes(calls.knn);
      expect(keyword).toHaveBeenCalledTimes(calls.bm25);
    });
  });

  it('gives SQL the standalone question and both searches the semantic query and the filters', async () => {
    const { service, run, semantic, keyword } = build();

    await service.retrieve(ROUTE);

    expect(run).toHaveBeenCalledWith(QUESTION);
    const request = { query: 'quiet family home', topK: 8, filters: ROUTE.filters };
    expect(semantic).toHaveBeenCalledWith(request);
    expect(keyword).toHaveBeenCalledWith(request);
  });

  it('searches the standalone question when the semantic query is empty', async () => {
    const { service, semantic } = build();

    await service.retrieve({ ...ROUTE, semanticQuery: '  ' });

    expect(semantic).toHaveBeenCalledWith(expect.objectContaining({ query: QUESTION }));
  });

  it('fuses the three lists, each property once, best first, with where each list placed it', async () => {
    const { service } = build();

    const retrieval = await service.retrieve(ROUTE);

    // 1342 is in all three lists, so it leads.
    expect(idsOf(retrieval)[0]).toBe(P1342);
    expect(idsOf(retrieval).sort()).toEqual([P1207, P1342, P1388, P2537].sort());
    expect(retrieval.properties[0]?.placements).toEqual({
      sql: { rank: 2, score: null },
      knn: { rank: 1, score: 0.91 },
      bm25: { rank: 2, score: 5.4 },
    });
    expect(retrieval.properties[0]?.property).toEqual(card(P1342));
    expect(retrieval.sql).toEqual({ query: SQL, aggregate: null });
    expect(retrieval.failures).toEqual([]);
  });

  it('keeps at most 8 properties', async () => {
    const many = Array.from({ length: 12 }, (_, index) => String(1000 + index));
    const { service } = build({ sql: () => Promise.resolve(rows(...many)) });

    const retrieval = await service.retrieve(ROUTE);

    expect(retrieval.properties).toHaveLength(8);
  });

  it('reads the cards for the fused ids from MySQL, and drops an id with no row', async () => {
    const { service, read } = build({ missingCards: [P2537] });

    const retrieval = await service.retrieve(ROUTE);

    expect(read).toHaveBeenCalledTimes(1);
    expect(idsOf(retrieval)).not.toContain(P2537);
  });

  it('attaches what each seller said, and null for a property with no questionnaire', async () => {
    const { service, read, readDisclosures } = build({ disclosed: [P1342] });

    const retrieval = await service.retrieve(ROUTE);

    expect(readDisclosures).toHaveBeenCalledWith(read.mock.calls[0][0]);
    const byId = new Map(retrieval.properties.map((entry) => [entry.property.id, entry]));
    expect(byId.get(P1342)?.disclosure).toMatchObject({ asbestos: 'no' });
    expect(byId.get(P1207)?.disclosure).toBeNull();
  });

  it('starts all three branches before any of them finishes', async () => {
    let finishSql: (result: SqlQueryResult) => void = () => undefined;
    const { service, semantic, keyword } = build({
      sql: () =>
        new Promise((resolve) => {
          finishSql = resolve;
        }),
    });

    const pending = service.retrieve(ROUTE);
    await Promise.resolve();

    expect(semantic).toHaveBeenCalledTimes(1);
    expect(keyword).toHaveBeenCalledTimes(1);
    finishSql(rows(P1207));
    await expect(pending).resolves.toMatchObject({ failures: [] });
  });

  describe('when a branch fails', () => {
    it.each([
      [
        'Elasticsearch is down for kNN',
        { knn: () => Promise.reject(new ServiceUnavailableException('Search is unavailable')) },
        { branch: 'knn', reason: 'failed' },
      ],
      [
        'Elasticsearch is down for BM25',
        { bm25: () => Promise.reject(new ServiceUnavailableException('Search is unavailable')) },
        { branch: 'bm25', reason: 'failed' },
      ],
      [
        'the validator rejects the SQL',
        {
          sql: () =>
            Promise.resolve<SqlQueryResult>({
              status: 'rejected',
              reason: 'table_not_allowed',
              detail: 'users',
            }),
        },
        { branch: 'sql', reason: 'rejected' },
      ],
      [
        'the model declines the SQL',
        { sql: () => Promise.resolve<SqlQueryResult>({ status: 'declined' }) },
        { branch: 'sql', reason: 'declined' },
      ],
      [
        'the SQL fails in MySQL twice',
        {
          sql: () =>
            Promise.reject(new UnprocessableEntityException('The generated query failed twice')),
        },
        { branch: 'sql', reason: 'failed' },
      ],
      [
        'the SQL lists rows with no listing id',
        {
          sql: () =>
            Promise.resolve<SqlQueryResult>({
              status: 'answered',
              sql: SQL,
              answer: { kind: 'rows', rows: [{ town: 'Inverurie' }], ordered: false },
              corrected: false,
            }),
        },
        { branch: 'sql', reason: 'no_ids' },
      ],
    ] as const)('still fuses the others when %s, and records it', async (_, fakes, failure) => {
      const { service, warn } = build(fakes);

      const retrieval = await service.retrieve(ROUTE);

      expect(retrieval.failures).toEqual([failure]);
      expect(retrieval.properties.length).toBeGreaterThan(0);
      for (const entry of retrieval.properties) {
        expect(entry.placements[failure.branch]).toBeNull();
      }
      expect(warn).toHaveBeenCalledWith(
        'retrieval branch failed',
        expect.objectContaining(failure),
        'HybridRetrievalService',
      );
    });

    it('records a branch that outlives its deadline as a timeout and answers without it', async () => {
      vi.useFakeTimers();
      const { service } = build({ sql: () => new Promise(() => undefined) });

      const pending = service.retrieve(ROUTE);
      await vi.advanceTimersByTimeAsync(BRANCH_TIMEOUT_MS);
      const retrieval = await pending;

      expect(retrieval.failures).toEqual([{ branch: 'sql', reason: 'timeout' }]);
      expect(idsOf(retrieval).sort()).toEqual([P1342, P1388, P2537].sort());
    });

    it('returns no properties, with every failure, when all branches fail', async () => {
      const down = (): Promise<never> => Promise.reject(new Error('down'));
      const { service } = build({ sql: down, knn: down, bm25: down });

      const retrieval = await service.retrieve(ROUTE);

      expect(retrieval.properties).toEqual([]);
      expect(retrieval.failures.map((failure) => failure.branch)).toEqual(['sql', 'knn', 'bm25']);
      expect(retrieval.sql).toBeNull();
    });
  });

  it('passes an aggregate through unfused, with the SQL that computed it', async () => {
    const aggregate = {
      kind: 'aggregate' as const,
      values: [{ average: 241_000 }],
      listingCount: 61,
    };
    const { service } = build({
      sql: () =>
        Promise.resolve<SqlQueryResult>({
          status: 'answered',
          sql: SQL,
          answer: aggregate,
          corrected: false,
        }),
    });

    const retrieval = await service.retrieve(ROUTE);

    expect(retrieval.sql).toEqual({ query: SQL, aggregate });
    expect(retrieval.ranking).toBe('aggregate');
  });

  it('drops the search lists for an aggregate and reads no card', async () => {
    const { service, read, readDisclosures } = build({
      sql: () =>
        Promise.resolve<SqlQueryResult>({
          status: 'answered',
          sql: SQL,
          answer: { kind: 'aggregate', values: [{ listings: 53 }], listingCount: 53 },
          corrected: false,
        }),
    });

    const retrieval = await service.retrieve(ROUTE);

    expect(retrieval.properties).toEqual([]);
    expect(read).toHaveBeenCalledWith([]);
    expect(readDisclosures).toHaveBeenCalledWith([]);
  });

  it('keeps ordered rows in SQL order, which fusion would change, with only the SQL placement', async () => {
    // Fused, P1342 would lead: it is second in SQL and first and second in the searches.
    const { service } = build({ sql: () => Promise.resolve(orderedRows(P1207, P1342, P50)) });

    const retrieval = await service.retrieve(ROUTE);

    expect(retrieval.ranking).toBe('sql_order');
    expect(idsOf(retrieval)).toEqual([P1207, P1342, P50]);
    for (const entry of retrieval.properties) {
      expect(entry.placements.knn).toBeNull();
      expect(entry.placements.bm25).toBeNull();
    }
    expect(retrieval.properties[1].placements.sql).toEqual({ rank: 2, score: null });
  });

  it('caps ordered rows at the chat property limit', async () => {
    const ids = Array.from({ length: 12 }, (_, index) => String(3000 + index));
    const { service } = build({ sql: () => Promise.resolve(orderedRows(...ids)) });

    const retrieval = await service.retrieve(ROUTE);

    expect(idsOf(retrieval)).toEqual(ids.slice(0, 8));
  });

  it('fuses unordered rows with the searches', async () => {
    const { service } = build();

    const retrieval = await service.retrieve(ROUTE);

    expect(retrieval.ranking).toBe('fused');
    expect(idsOf(retrieval)[0]).toBe(P1342);
  });

  it('reads a listing id from a property_id column too', async () => {
    const { service } = build({
      sql: () =>
        Promise.resolve<SqlQueryResult>({
          status: 'answered',
          sql: SQL,
          answer: { kind: 'rows', rows: [{ property_id: Number(P50) }], ordered: false },
          corrected: false,
        }),
    });

    const retrieval = await service.retrieve({ ...ROUTE, intent: 'structured' });

    expect(idsOf(retrieval)).toEqual([P50]);
  });

  it('logs counts, failures and timings, never the question', async () => {
    const { service, log } = build();

    await service.retrieve(ROUTE);

    const [message, meta] = log.mock.calls[0] as [string, Record<string, unknown>];
    expect(meta).toMatchObject({ intent: 'hybrid', properties: 4, failures: [] });
    expect(JSON.stringify([message, meta])).not.toContain('Inverurie under');
    expect(JSON.stringify([message, meta])).not.toContain('quiet family');
  });

  describe('the router filters', () => {
    it('drops a SQL row outside the price range and records it, keeping the rest', async () => {
      // The SQL read "under £300k" where the router read "under £250k".
      const { service, warn } = build({ cards: { [P1207]: { price: 280_000 } } });

      const retrieval = await service.retrieve(ROUTE);

      expect(idsOf(retrieval)).not.toContain(P1207);
      expect(idsOf(retrieval)).toContain(P1342);
      expect(retrieval.violations).toEqual([
        {
          id: P1207,
          filters: ['maxPrice'],
          placements: { sql: { rank: 1, score: null }, knn: null, bm25: null },
        },
      ]);
      expect(warn).toHaveBeenCalledWith(
        'retrieval dropped properties outside the filters',
        { violations: retrieval.violations },
        'HybridRetrievalService',
      );
    });

    it('fills the top k from the candidates after the ones that were dropped', async () => {
      const ids = Array.from({ length: 10 }, (_, index) => String(3000 + index));
      const { service } = build({
        sql: () => Promise.resolve(rows(...ids)),
        knn: () => Promise.resolve([]),
        bm25: () => Promise.resolve([]),
        cards: { [ids[0]]: { town: 'Ellon' }, [ids[1]]: { town: 'Ellon' } },
      });

      const retrieval = await service.retrieve(ROUTE);

      expect(idsOf(retrieval)).toEqual(ids.slice(2));
      expect(retrieval.violations.map((violation) => violation.id)).toEqual(ids.slice(0, 2));
    });

    it('records nothing when every property passes', async () => {
      const { service, warn } = build();

      const retrieval = await service.retrieve(ROUTE);

      expect(retrieval.violations).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
