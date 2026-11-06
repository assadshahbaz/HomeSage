import { fileURLToPath } from 'node:url';
import { GatewayTimeoutException, Injectable } from '@nestjs/common';
import {
  CHAT_INTENT,
  propertyIdSchema,
  questionSchema,
  ROUTE_FALLBACK,
  searchFiltersSchema,
} from '../../contracts/index.js';
import type { RouteFallback, RouterReply } from '../../contracts/index.js';
import { AppLogger } from '../../platform/logging/app-logger.js';
import { LLM_JOB } from '../llm/llm-job.js';
import { LlmService } from '../llm/llm.service.js';
import { PromptLoader } from '../llm/prompts/prompt-loader.js';
import { renderRouterPrompt } from './prompts/router-prompt.js';
import { checkRouteFilters } from './reply/route-filters.js';
import { readRouterReply } from './reply/router-reply.js';
import type { Route, RouterTurn } from './route.js';
import { FilterVocabulary } from './vocabulary/filter-vocabulary.js';
import type { FilterValues } from './vocabulary/filter-vocabulary.js';

const PROMPTS_DIRECTORY = fileURLToPath(new URL('./prompts/', import.meta.url));
const ROUTER_PROMPT = { name: 'router', version: 1 } as const;

// The cap covers a reasoning model's thinking as well as the JSON, so it sits
// well above what the reply itself needs.
const ROUTER_MAX_TOKENS = 2048;

// A cited id as the model may write it, with or without the marker's prefix.
const CITED_ID_PREFIX = /^P-/i;

/**
 * Reads a question into a route: the intent, checked filters, what to search
 * by meaning, and the standalone rewrite. A model problem never fails the
 * request. A timeout, a provider error or a reply that cannot be read or does
 * not fit the schema all fall back to hybrid search on the question as asked.
 */
@Injectable()
export class QueryRouter {
  public constructor(
    private readonly llm: LlmService,
    private readonly prompts: PromptLoader,
    private readonly vocabulary: FilterVocabulary,
    private readonly logger: AppLogger,
  ) {}

  /** Routes `question`, reading a follow up against the recent turns, oldest first. */
  public async route(question: string, recentTurns: readonly RouterTurn[] = []): Promise<Route> {
    const [template, values] = await Promise.all([
      this.prompts.load(PROMPTS_DIRECTORY, ROUTER_PROMPT.name, ROUTER_PROMPT.version),
      this.vocabulary.values(),
    ]);

    let text: string;
    try {
      ({ text } = await this.llm.complete({
        job: LLM_JOB.ROUTER,
        prompt: { ...template, text: renderRouterPrompt(template.text, values) },
        data: { question, recent_turns: JSON.stringify(recentTurns) },
        maxTokens: ROUTER_MAX_TOKENS,
      }));
    } catch (error) {
      // Any failure of the call itself is the provider's, and costs the
      // question its routing, never its answer.
      const reason =
        error instanceof GatewayTimeoutException
          ? ROUTE_FALLBACK.TIMEOUT
          : ROUTE_FALLBACK.PROVIDER_ERROR;
      return this.fallBack(question, reason, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const read = readRouterReply(text);
    if (!read.ok) {
      return this.fallBack(question, read.reason, 'issues' in read ? { issues: read.issues } : {});
    }
    return this.fromReply(question, read.reply, values, recentTurns);
  }

  private fromReply(
    question: string,
    reply: RouterReply,
    values: FilterValues,
    recentTurns: readonly RouterTurn[],
  ): Route {
    const standaloneQuestion = this.standalone(question, reply.standaloneQuestion);

    if (reply.intent === CHAT_INTENT.OUT_OF_SCOPE) {
      return this.logged({
        intent: reply.intent,
        filters: searchFiltersSchema.parse({}),
        semanticQuery: '',
        standaloneQuestion,
        propertyIds: [],
        fallback: null,
      });
    }

    const { filters, dropped } = checkRouteFilters(reply.filters ?? {}, values);
    if (dropped.length > 0) {
      this.logger.warn('router dropped filters', { dropped }, QueryRouter.name);
    }

    const semanticQuery = reply.semanticQuery?.trim() ?? '';
    return this.logged({
      intent: reply.intent,
      filters,
      // A structured question needs no meaning search. Otherwise an empty
      // description is filled from the question, never searched as blank.
      semanticQuery:
        reply.intent === CHAT_INTENT.STRUCTURED || semanticQuery !== ''
          ? semanticQuery
          : standaloneQuestion,
      standaloneQuestion,
      propertyIds: this.citable(reply.propertyIds ?? [], recentTurns),
      fallback: null,
    });
  }

  /** The model's rewrite when it is a usable question, otherwise the question as asked. */
  private standalone(question: string, rewrite: string | null | undefined): string {
    const parsed = questionSchema.safeParse(rewrite);
    return parsed.success ? parsed.data : question;
  }

  /** The ids an earlier answer cited, in the model's order; any other id is dropped. */
  private citable(ids: readonly string[], recentTurns: readonly RouterTurn[]): string[] {
    const cited = new Set(recentTurns.flatMap((turn) => turn.citedIds));
    const kept: string[] = [];
    const dropped: string[] = [];
    for (const raw of ids) {
      const id = raw.trim().replace(CITED_ID_PREFIX, '');
      if (propertyIdSchema.safeParse(id).success && cited.has(id)) {
        if (!kept.includes(id)) {
          kept.push(id);
        }
      } else {
        dropped.push(raw);
      }
    }
    if (dropped.length > 0) {
      this.logger.warn('router dropped property ids', { dropped }, QueryRouter.name);
    }
    return kept;
  }

  private fallBack(
    question: string,
    reason: RouteFallback,
    detail: Readonly<Record<string, unknown>>,
  ): Route {
    this.logger.warn(
      `router fell back to hybrid: ${reason}`,
      { reason, ...detail },
      QueryRouter.name,
    );
    return this.logged({
      intent: CHAT_INTENT.HYBRID,
      filters: searchFiltersSchema.parse({}),
      semanticQuery: question,
      standaloneQuestion: question,
      propertyIds: [],
      fallback: reason,
    });
  }

  private logged(route: Route): Route {
    this.logger.log(
      `router ${route.intent}`,
      {
        intent: route.intent,
        filters: Object.keys(route.filters),
        propertyIds: route.propertyIds.length,
        fallback: route.fallback,
      },
      QueryRouter.name,
    );
    return route;
  }
}
