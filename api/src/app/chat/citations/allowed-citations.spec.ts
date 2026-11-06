import type { PropertySummary } from '../../../contracts/index.js';
import type { HybridRetrieval } from '../../retrieval/hybrid-retrieval.service.js';
import { allowedCitations } from './allowed-citations.js';

const LARKFIELD_RISE = '1207';
const ELLON_FLAT = '1342';

function retrieval(overrides: Partial<HybridRetrieval> = {}): HybridRetrieval {
  return {
    properties: [LARKFIELD_RISE, ELLON_FLAT].map((id) => ({
      property: { id } as PropertySummary,
      disclosure: null,
      score: 0.03,
      placements: { sql: null, knn: { rank: 1, score: 0.9 }, bm25: null },
    })),
    ranking: 'fused',
    violations: [],
    sql: null,
    failures: [],
    timing: { branches: {}, totalMs: 1 },
    ...overrides,
  };
}

describe('allowedCitations', () => {
  it('allows exactly the properties a turn retrieved', () => {
    expect(allowedCitations(retrieval())).toEqual({
      kind: 'properties',
      ids: new Set([LARKFIELD_RISE, ELLON_FLAT]),
    });
  });

  it('allows nothing when a turn retrieved nothing', () => {
    expect(allowedCitations(retrieval({ properties: [] }))).toEqual({
      kind: 'properties',
      ids: new Set(),
    });
  });

  it('allows the aggregate alone when the SQL computed values', () => {
    expect(
      allowedCitations(
        retrieval({
          sql: {
            query: 'SELECT COUNT(*) AS listings FROM properties LIMIT 50',
            aggregate: { kind: 'aggregate', values: [{ listings: 53 }], listingCount: 53 },
          },
        }),
      ),
    ).toEqual({ kind: 'aggregate' });
  });

  it('allows the properties when the SQL listed rows', () => {
    expect(
      allowedCitations(retrieval({ sql: { query: 'SELECT id FROM properties', aggregate: null } })),
    ).toMatchObject({ kind: 'properties' });
  });
});
