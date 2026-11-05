import { performance } from 'node:perf_hooks';
import { Injectable } from '@nestjs/common';
import {
  CHAT_INTENT,
  chatEventSchema,
  NO_RESULTS_REASON,
  PROPERTY_RANKING,
} from '../../contracts/index.js';
import type { ChatEvent, ChatRetrievalEvent, NoResultsReason } from '../../contracts/index.js';
import { AppLogger } from '../../platform/logging/app-logger.js';
import { HybridRetrievalService } from '../retrieval/hybrid-retrieval.service.js';
import type { HybridRetrieval } from '../retrieval/hybrid-retrieval.service.js';
import { QueryRouter } from '../router/query-router.js';
import type { Route } from '../router/route.js';
import { ROUTER_DECLINE_MESSAGE } from '../router/router-decline.js';
import { GuardedAnswer } from './answer/guarded-answer.js';
import { noMatchMessage, SEARCH_FAILED_MESSAGE } from './no-results/no-results-message.js';

/**
 * One chat turn, stage by stage: route the question, retrieve what it needs,
 * then stream the guarded answer, or a fixed reply when retrieval found
 * nothing, so the answer model is never asked about an empty context. Orchestration only: the router, retrieval
 * and the guarded answer own their work. Every event is parsed with the
 * contract on the way out, so the stream sends exactly what it declares.
 */
@Injectable()
export class ChatService {
  public constructor(
    private readonly router: QueryRouter,
    private readonly retrieval: HybridRetrievalService,
    private readonly answer: GuardedAnswer,
    private readonly logger: AppLogger,
  ) {}

  /** The events answering `question`, in stream order, ending with `done`. */
  public async *answerQuestion(question: string): AsyncGenerator<ChatEvent> {
    const startedAt = performance.now();
    const since = (): number => Math.round(performance.now() - startedAt);

    const route = await this.router.route(question);
    const routeMs = since();
    yield event({
      type: 'route',
      intent: route.intent,
      filters: route.filters,
      standaloneQuestion: route.standaloneQuestion,
      fallback: route.fallback,
    });

    if (route.intent === CHAT_INTENT.OUT_OF_SCOPE) {
      yield event({ type: 'token', text: ROUTER_DECLINE_MESSAGE });
      yield event({ type: 'citations', kind: 'properties', ids: [] });
      yield event({ type: 'done' });
      this.logTurn(route, null, null, { routeMs, totalMs: since() });
      return;
    }

    const found = await this.retrieval.retrieve(route);
    const retrievalMs = since() - routeMs;
    const noResults = noResultsReason(found);
    yield event(retrievalEvent(found, noResults));

    if (noResults !== null) {
      const text =
        noResults === NO_RESULTS_REASON.NO_MATCH
          ? noMatchMessage(route.filters)
          : SEARCH_FAILED_MESSAGE;
      yield event({ type: 'token', text });
      yield event({ type: 'citations', kind: 'properties', ids: [] });
      yield event({ type: 'done' });
      this.logTurn(route, found, noResults, { routeMs, retrievalMs, totalMs: since() });
      return;
    }

    let firstTokenMs: number | null = null;
    let stripped = 0;
    for await (const piece of this.answer.stream(route.standaloneQuestion, found)) {
      if (piece.kind === 'text') {
        firstTokenMs ??= since();
        yield event({ type: 'token', text: piece.text });
      } else {
        stripped = piece.stripped.length;
        yield event(piece.citations);
      }
    }
    yield event({ type: 'done' });
    this.logTurn(route, found, null, {
      routeMs,
      retrievalMs,
      firstTokenMs,
      totalMs: since(),
      stripped,
    });
  }

  // Never the question or the answer: they may say something about the person asking.
  private logTurn(
    route: Route,
    found: HybridRetrieval | null,
    noResults: NoResultsReason | null,
    measures: Readonly<Record<string, number | null>>,
  ): void {
    this.logger.log(
      'chat turn',
      {
        intent: route.intent,
        fallback: route.fallback,
        properties: found?.properties.length ?? 0,
        noResults,
        aggregate: found?.sql?.aggregate != null,
        failures: found?.failures ?? [],
        branches: found?.timing.branches ?? {},
        ...measures,
      },
      ChatService.name,
    );
  }
}

/**
 * Why there is nothing to answer from, or null when there is. A failed search
 * might have found something, so nothing back after one is not a no match.
 */
function noResultsReason(found: HybridRetrieval): NoResultsReason | null {
  if (found.properties.length > 0 || found.sql?.aggregate) {
    return null;
  }
  return found.failures.length > 0 ? NO_RESULTS_REASON.SEARCH_FAILED : NO_RESULTS_REASON.NO_MATCH;
}

function retrievalEvent(
  found: HybridRetrieval,
  noResults: NoResultsReason | null,
): ChatRetrievalEvent {
  const { sql } = found;
  if (sql?.aggregate) {
    return {
      type: 'retrieval',
      kind: 'aggregate',
      sql: sql.query,
      values: sql.aggregate.values,
      listingCount: sql.aggregate.listingCount,
    };
  }
  if (noResults !== null) {
    return { type: 'retrieval', kind: 'none', reason: noResults };
  }
  return {
    type: 'retrieval',
    kind: 'properties',
    properties: found.properties.map((entry) => entry.property),
    // An aggregate ranking always carries its aggregate, which returned above.
    ranking:
      found.ranking === PROPERTY_RANKING.SQL_ORDER
        ? PROPERTY_RANKING.SQL_ORDER
        : PROPERTY_RANKING.FUSED,
  };
}

function event(value: ChatEvent): ChatEvent {
  return chatEventSchema.parse(value);
}
