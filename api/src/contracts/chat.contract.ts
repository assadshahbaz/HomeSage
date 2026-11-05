import * as z from 'zod';
import { propertyIdSchema, propertySummarySchema } from './property.contract.js';
import { questionSchema } from './question.contract.js';
import { searchFiltersSchema } from './search.contract.js';
import { sqlRowSchema } from './sql.contract.js';

/** The most properties one answer is given: the top k after fusion. */
export const CHAT_PROPERTIES_MAX = 8;

/** What the router decided the question needs. */
export const CHAT_INTENT = {
  STRUCTURED: 'structured',
  SEMANTIC: 'semantic',
  HYBRID: 'hybrid',
  OUT_OF_SCOPE: 'out_of_scope',
} as const;

export const chatIntentSchema = z.enum(CHAT_INTENT);

/**
 * Why the router's own reading was not used. The question then goes to hybrid
 * search as asked, with no filters beyond the defaults.
 */
export const ROUTE_FALLBACK = {
  /** The router model did not answer within its deadline. */
  TIMEOUT: 'timeout',
  /** The provider refused or failed the call. */
  PROVIDER_ERROR: 'provider_error',
  /** The reply held no JSON object that could be read. */
  PARSE_FAILURE: 'parse_failure',
  /** The JSON did not match the router reply schema. */
  SCHEMA_FAILURE: 'schema_failure',
} as const;

export const routeFallbackSchema = z.enum(ROUTE_FALLBACK);

/**
 * Request body of `POST /chat`. The session id is made by the browser and keys
 * the conversation memory, so it is held to a UUID rather than any string.
 */
export const chatRequestSchema = z.strictObject({
  question: questionSchema,
  sessionId: z.uuid(),
});

const sqlAnswerSource = {
  /** The SQL that ran, as the validator rewrote it. */
  sql: z.string().min(1),
  /** How many listings the values were computed from. */
  listingCount: z.number().int().nonnegative(),
};

/** First event of every stream: how the question was read. */
export const chatRouteEventSchema = z.object({
  type: z.literal('route'),
  intent: chatIntentSchema,
  /** The filters as applied, defaults included. */
  filters: searchFiltersSchema,
  /** The question rewritten to stand on its own; the question itself when it already does. */
  standaloneQuestion: questionSchema,
  /** Set when the router failed and the question fell back to hybrid search; null otherwise. */
  fallback: routeFallbackSchema.nullable(),
});

/**
 * How the properties were put in order: fused from every search that ran, or
 * kept in the order the SQL returned because the question asked for one.
 */
export const PROPERTY_RANKING = {
  FUSED: 'fused',
  SQL_ORDER: 'sql_order',
} as const;

export const propertyRankingSchema = z.enum(PROPERTY_RANKING);

/** Why retrieval gave the answer nothing to work from. */
export const NO_RESULTS_REASON = {
  /** Every search ran and no listing met the question. */
  NO_MATCH: 'no_match',
  /** A search could not finish, so whether anything matches is unknown. */
  SEARCH_FAILED: 'search_failed',
} as const;

export const noResultsReasonSchema = z.enum(NO_RESULTS_REASON);

/**
 * What retrieval found: properties, one aggregate result, or nothing. Absent
 * from an out of scope stream, which retrieves nothing.
 */
export const chatRetrievalEventSchema = z.discriminatedUnion('kind', [
  z.object({
    type: z.literal('retrieval'),
    kind: z.literal('properties'),
    /** In retrieval order; the answer's citations decide which get cards. */
    properties: z.array(propertySummarySchema).min(1).max(CHAT_PROPERTIES_MAX),
    ranking: propertyRankingSchema,
  }),
  z.object({
    type: z.literal('retrieval'),
    kind: z.literal('aggregate'),
    ...sqlAnswerSource,
    values: z.array(sqlRowSchema),
  }),
  z.object({
    type: z.literal('retrieval'),
    kind: z.literal('none'),
    reason: noResultsReasonSchema,
  }),
]);

/** A piece of the answer, already through the citation guard. */
export const chatTokenEventSchema = z.object({
  type: z.literal('token'),
  text: z.string().min(1),
});

/**
 * What the finished answer cited, derived from its guarded text: properties in
 * order of first citation, each once, or the aggregate query it quoted.
 */
export const chatCitationsEventSchema = z.discriminatedUnion('kind', [
  z.object({
    type: z.literal('citations'),
    kind: z.literal('properties'),
    ids: z
      .array(propertyIdSchema)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'ids must be unique' }),
  }),
  z.object({
    type: z.literal('citations'),
    kind: z.literal('aggregate'),
    ...sqlAnswerSource,
  }),
]);

/** Ends a stream that answered. */
export const chatDoneEventSchema = z.object({
  type: z.literal('done'),
});

/** Ends a stream that failed, at any point after it opened. Nothing follows it. */
export const chatErrorEventSchema = z.object({
  type: z.literal('error'),
  /** Safe to show the user: no stack, no internals. */
  message: z.string().min(1),
});

/**
 * Any event on the `/chat` stream. Each is checked on its own; the order
 * (route, retrieval, tokens, citations, done, or error at any point) is the
 * consumer's to enforce.
 */
export const chatEventSchema = z.discriminatedUnion('type', [
  chatRouteEventSchema,
  chatRetrievalEventSchema,
  chatTokenEventSchema,
  chatCitationsEventSchema,
  chatDoneEventSchema,
  chatErrorEventSchema,
]);

export type ChatIntent = z.infer<typeof chatIntentSchema>;
export type RouteFallback = z.infer<typeof routeFallbackSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatRouteEvent = z.infer<typeof chatRouteEventSchema>;
export type PropertyRanking = z.infer<typeof propertyRankingSchema>;
export type NoResultsReason = z.infer<typeof noResultsReasonSchema>;
export type ChatRetrievalEvent = z.infer<typeof chatRetrievalEventSchema>;
export type ChatTokenEvent = z.infer<typeof chatTokenEventSchema>;
export type ChatCitationsEvent = z.infer<typeof chatCitationsEventSchema>;
export type ChatDoneEvent = z.infer<typeof chatDoneEventSchema>;
export type ChatErrorEvent = z.infer<typeof chatErrorEventSchema>;
export type ChatEvent = z.infer<typeof chatEventSchema>;
