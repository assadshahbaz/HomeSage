import { performance } from 'node:perf_hooks';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CHAT_INTENT,
  CHAT_PROPERTIES_MAX,
  PROPERTY_RANKING,
  SEARCH_TOP_K_DEFAULT,
} from '../../contracts/index.js';
import type {
  PropertySummary,
  SearchResult,
  SemanticSearchRequest,
  SqlRow,
} from '../../contracts/index.js';
import type { RetrievalConfig } from '../../infra/config/retrieval.config.js';
import { AppLogger } from '../../platform/logging/app-logger.js';
import type { DisclosureRow } from '../ingestion/document/property-row.js';
import type { Route } from '../router/route.js';
import type { SqlAnswer } from '../sql/sql-answer.js';
import { SqlQueryService } from '../sql/sql-query.service.js';
import { fuseRankings } from './fusion/reciprocal-rank-fusion.js';
import type { FusedId } from './fusion/reciprocal-rank-fusion.js';
import { BranchTimeoutError, withinDeadline } from './hybrid/branch-deadline.js';
import { KeywordSearchService } from './keyword-search.service.js';
import { PropertyCardReader } from './properties/property-card-reader.js';
import { PropertyDisclosureReader } from './properties/property-disclosure-reader.js';
import { filterViolations } from './query/filter-violations.js';
import type { FilterName } from './query/filter-violations.js';
import { SemanticSearchService } from './semantic-search.service.js';

/** The ways retrieval can look for properties. */
export const RETRIEVAL_BRANCH = {
  SQL: 'sql',
  KNN: 'knn',
  BM25: 'bm25',
} as const;

export type RetrievalBranch = (typeof RETRIEVAL_BRANCH)[keyof typeof RETRIEVAL_BRANCH];

/** Why a branch gave no list. */
export const BRANCH_FAILURE = {
  /** It did not finish within the branch deadline. */
  TIMEOUT: 'timeout',
  /** It threw: a backing service was down, or the SQL failed in MySQL twice. */
  FAILED: 'failed',
  /** The validator refused the generated SQL. */
  REJECTED: 'rejected',
  /** The model said the data cannot answer the question. */
  DECLINED: 'declined',
  /** The SQL listed rows without a listing id to fuse them by. */
  NO_IDS: 'no_ids',
} as const;

export type BranchFailureReason = (typeof BRANCH_FAILURE)[keyof typeof BRANCH_FAILURE];

/** A branch that gave no list, and why. */
export interface BranchFailure {
  readonly branch: RetrievalBranch;
  readonly reason: BranchFailureReason;
}

/** Where one list placed a property, counted from 1. SQL rows carry no score. */
export interface ListPlacement {
  readonly rank: number;
  readonly score: number | null;
}

/**
 * One property after fusion, with its card and what its seller said read from
 * MySQL, and where each list placed it.
 */
export interface RetrievedProperty {
  readonly property: PropertySummary;
  /** The seller's questionnaire answers, or null when the seller filled in none. */
  readonly disclosure: DisclosureRow | null;
  /** The fused score. Comparable within one retrieval only. */
  readonly score: number;
  readonly placements: Readonly<Record<RetrievalBranch, ListPlacement | null>>;
}

/**
 * Which path retrieval took: properties fused from every list, properties in
 * the order the SQL returned them, or the SQL's aggregate with no properties.
 */
export const RETRIEVAL_RANKING = {
  ...PROPERTY_RANKING,
  AGGREGATE: 'aggregate',
} as const;

export type RetrievalRanking = (typeof RETRIEVAL_RANKING)[keyof typeof RETRIEVAL_RANKING];

/** Values the SQL computed over listings, which name no property to fuse. */
export type SqlAggregate = Extract<SqlAnswer, { kind: 'aggregate' }>;

/** A property a branch found outside the router's filters, which was dropped. */
export interface FilterViolation {
  readonly id: string;
  readonly filters: readonly FilterName[];
  /** Where each list placed it, so the branch that let it through can be seen. */
  readonly placements: Readonly<Record<RetrievalBranch, ListPlacement | null>>;
}

/** Everything one question's retrieval found. */
export interface HybridRetrieval {
  /** Best first, at most the chat's property limit, each once. */
  readonly properties: RetrievedProperty[];
  readonly ranking: RetrievalRanking;
  /** Properties a branch found that the router's filters exclude, dropped before the cut. */
  readonly violations: FilterViolation[];
  /** The SQL that ran, with its aggregate when it computed values; null when no SQL ran. */
  readonly sql: { readonly query: string; readonly aggregate: SqlAggregate | null } | null;
  readonly failures: BranchFailure[];
  /** Milliseconds per branch that ran, and in all. */
  readonly timing: {
    readonly branches: Readonly<Partial<Record<RetrievalBranch, number>>>;
    readonly totalMs: number;
  };
}

/** What one branch gave: a ranked list, maybe with the SQL that produced it. */
interface BranchList {
  readonly ranking: readonly { readonly id: string; readonly score: number | null }[];
  readonly sql?: { readonly query: string; readonly aggregate: SqlAggregate | null };
  /** True when the SQL ordered its rows because the question asked for an order. */
  readonly ordered?: boolean;
}

/** A branch that ran and could not give a list. */
class BranchFailed extends Error {
  public constructor(public readonly reason: BranchFailureReason) {
    super(reason);
  }
}

const BRANCHES_BY_INTENT: Readonly<Record<Route['intent'], readonly RetrievalBranch[]>> = {
  [CHAT_INTENT.STRUCTURED]: [RETRIEVAL_BRANCH.SQL],
  [CHAT_INTENT.SEMANTIC]: [RETRIEVAL_BRANCH.KNN, RETRIEVAL_BRANCH.BM25],
  [CHAT_INTENT.HYBRID]: [RETRIEVAL_BRANCH.SQL, RETRIEVAL_BRANCH.KNN, RETRIEVAL_BRANCH.BM25],
  // Declined before retrieval, so nothing is searched.
  [CHAT_INTENT.OUT_OF_SCOPE]: [],
};

// A rows query may group by the questionnaire's key instead of the listing's.
const LISTING_ID_COLUMNS = ['id', 'property_id'] as const;

/**
 * Retrieves properties for a routed question: SQL for what columns can answer,
 * kNN and BM25 for what words and meaning can, all three side by side under
 * one deadline each, merged with Reciprocal Rank Fusion. A branch that fails
 * is recorded and the others still answer. Cards for the fused ids are read
 * from MySQL, the source of truth, not from the search index.
 */
@Injectable()
export class HybridRetrievalService {
  private readonly branchTimeoutMs: number;

  public constructor(
    private readonly sql: SqlQueryService,
    private readonly semantic: SemanticSearchService,
    private readonly keyword: KeywordSearchService,
    private readonly cards: PropertyCardReader,
    private readonly disclosures: PropertyDisclosureReader,
    private readonly logger: AppLogger,
    configService: ConfigService,
  ) {
    this.branchTimeoutMs = configService.getOrThrow<RetrievalConfig>('retrieval').branchTimeoutMs;
  }

  /** Runs the branches the route's intent needs and fuses what they find. */
  public async retrieve(route: Route): Promise<HybridRetrieval> {
    const startedAt = performance.now();
    const branches = BRANCHES_BY_INTENT[route.intent];
    const settled = await Promise.all(
      branches.map(async (branch) => {
        const branchStartedAt = performance.now();
        const outcome = await withinDeadline(this.run(branch, route), this.branchTimeoutMs).then(
          (list) => ({ ok: true as const, list }),
          (error: unknown) => ({ ok: false as const, reason: failureReason(error), error }),
        );
        return { branch, outcome, ms: Math.round(performance.now() - branchStartedAt) };
      }),
    );

    const failures: BranchFailure[] = [];
    const lists = new Map<RetrievalBranch, BranchList>();
    for (const { branch, outcome } of settled) {
      if (outcome.ok) {
        lists.set(branch, outcome.list);
      } else {
        failures.push({ branch, reason: outcome.reason });
        // The error itself goes to the log, so an outage or a bug can be told apart there.
        this.logger.warn(
          'retrieval branch failed',
          { branch, reason: outcome.reason, error: errorText(outcome.error) },
          HybridRetrievalService.name,
        );
      }
    }

    // An aggregate names no property, and an order the question asked for is
    // not to be fused away, so in both cases the search lists are dropped.
    const sqlList = lists.get(RETRIEVAL_BRANCH.SQL);
    const ranking: RetrievalRanking = sqlList?.sql?.aggregate
      ? RETRIEVAL_RANKING.AGGREGATE
      : sqlList?.ordered === true
        ? RETRIEVAL_RANKING.SQL_ORDER
        : RETRIEVAL_RANKING.FUSED;
    const order =
      ranking === RETRIEVAL_RANKING.FUSED
        ? [...lists.keys()]
        : ranking === RETRIEVAL_RANKING.SQL_ORDER
          ? [RETRIEVAL_BRANCH.SQL]
          : [];
    const dropped = [...lists.keys()].filter((branch) => !order.includes(branch));
    // Every candidate is fused and checked before the cut, so a property the
    // router's filters exclude never costs a place in the top k.
    const candidates = fuseRankings(
      order.map((branch) => lists.get(branch)?.ranking.map((entry) => entry.id) ?? []),
      Number.POSITIVE_INFINITY,
    );
    const cards = new Map(
      (await this.cards.read(candidates.map((entry) => entry.id))).map((read) => [
        read.card.id,
        read,
      ]),
    );
    const violations: FilterViolation[] = [];
    const kept = candidates
      .flatMap((entry) => {
        const read = cards.get(entry.id);
        if (read === undefined) {
          return [];
        }
        const placements = placementsOf(entry, order, lists);
        const filters = filterViolations(read.card, read.kind, route.filters);
        if (filters.length > 0) {
          violations.push({ id: entry.id, filters, placements });
          return [];
        }
        return [{ entry, card: read.card, placements }];
      })
      .slice(0, CHAT_PROPERTIES_MAX);
    const disclosures = await this.disclosures.read(kept.map(({ entry }) => entry.id));
    const properties = kept.map(({ entry, card, placements }): RetrievedProperty => ({
      property: card,
      disclosure: disclosures.get(entry.id) ?? null,
      score: entry.score,
      placements,
    }));
    if (violations.length > 0) {
      this.logger.warn(
        'retrieval dropped properties outside the filters',
        { violations },
        HybridRetrievalService.name,
      );
    }

    const retrieval: HybridRetrieval = {
      properties,
      ranking,
      violations,
      sql: lists.get(RETRIEVAL_BRANCH.SQL)?.sql ?? null,
      failures,
      timing: {
        branches: Object.fromEntries(settled.map(({ branch, ms }) => [branch, ms])),
        totalMs: Math.round(performance.now() - startedAt),
      },
    };
    // Never the question: it may say something about the person asking.
    this.logger.log(
      'hybrid retrieval',
      {
        intent: route.intent,
        ranking,
        dropped,
        lists: Object.fromEntries(
          order.map((branch) => [branch, lists.get(branch)?.ranking.length]),
        ),
        failures,
        properties: properties.length,
        violations: violations.length,
        aggregate: retrieval.sql?.aggregate !== null && retrieval.sql !== null,
        ...retrieval.timing,
      },
      HybridRetrievalService.name,
    );
    return retrieval;
  }

  private async run(branch: RetrievalBranch, route: Route): Promise<BranchList> {
    if (branch === RETRIEVAL_BRANCH.SQL) {
      return this.runSql(route.standaloneQuestion);
    }
    const request: SemanticSearchRequest = {
      // The filters carry the hard constraints, so the words and the vector get only the description.
      query: route.semanticQuery.trim() === '' ? route.standaloneQuestion : route.semanticQuery,
      topK: SEARCH_TOP_K_DEFAULT,
      filters: route.filters,
    };
    const search = branch === RETRIEVAL_BRANCH.KNN ? this.semantic : this.keyword;
    const { results } = await search.search(request);
    return { ranking: results.map(toRanked) };
  }

  private async runSql(question: string): Promise<BranchList> {
    const result = await this.sql.run(question);
    if (result.status === 'declined') {
      throw new BranchFailed(BRANCH_FAILURE.DECLINED);
    }
    if (result.status === 'rejected') {
      throw new BranchFailed(BRANCH_FAILURE.REJECTED);
    }
    const { answer } = result;
    if (answer.kind === 'aggregate') {
      return { ranking: [], sql: { query: result.sql, aggregate: answer } };
    }
    const ids = answer.rows.flatMap((row) => listingId(row) ?? []);
    if (ids.length === 0 && answer.rows.length > 0) {
      throw new BranchFailed(BRANCH_FAILURE.NO_IDS);
    }
    return {
      ranking: ids.map((id) => ({ id, score: null })),
      sql: { query: result.sql, aggregate: null },
      ordered: answer.ordered,
    };
  }
}

function placementsOf(
  entry: FusedId,
  order: readonly RetrievalBranch[],
  lists: ReadonlyMap<RetrievalBranch, BranchList>,
): Record<RetrievalBranch, ListPlacement | null> {
  const placements: Record<RetrievalBranch, ListPlacement | null> = {
    [RETRIEVAL_BRANCH.SQL]: null,
    [RETRIEVAL_BRANCH.KNN]: null,
    [RETRIEVAL_BRANCH.BM25]: null,
  };
  order.forEach((branch, index) => {
    const rank = entry.ranks[index];
    if (rank !== null) {
      const score = lists.get(branch)?.ranking[rank - 1]?.score ?? null;
      placements[branch] = { rank, score };
    }
  });
  return placements;
}

function toRanked(result: SearchResult): { id: string; score: number } {
  return { id: result.id, score: result.score };
}

/** The listing id a SQL row carries, as digits, or null when it has none. */
function listingId(row: SqlRow): string | null {
  for (const column of LISTING_ID_COLUMNS) {
    const value = row[column];
    if (
      (typeof value === 'number' && Number.isInteger(value)) ||
      (typeof value === 'string' && /^\d+$/.test(value))
    ) {
      return String(value);
    }
  }
  return null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function failureReason(error: unknown): BranchFailureReason {
  if (error instanceof BranchFailed) {
    return error.reason;
  }
  return error instanceof BranchTimeoutError ? BRANCH_FAILURE.TIMEOUT : BRANCH_FAILURE.FAILED;
}
