import * as z from 'zod';
import { questionSchema } from './question.contract.js';

/** Request body of `POST /sql`. */
export const sqlRequestSchema = z.object({
  question: questionSchema,
});

/**
 * One row from a generated query. Its columns are whatever the model chose, so
 * only the cell values are fixed: strings, numbers, booleans or null. MySQL
 * sends DECIMAL results such as AVG as strings.
 */
export const sqlRowSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

/** Response body of `POST /sql` when the question produced rows. */
const answeredBase = {
  question: z.string(),
  /** The SQL that ran, as the validator rewrote it. */
  sql: z.string(),
  /** True when the first query failed in MySQL and the model's one correction ran instead. */
  corrected: z.boolean(),
};

/** The question listed properties. */
export const sqlRowsResponseSchema = z.object({
  kind: z.literal('rows'),
  ...answeredBase,
  rows: z.array(sqlRowSchema),
  rowCount: z.number().int().nonnegative(),
  /** True when the query had an ORDER BY, so the order of `rows` is part of the answer. */
  ordered: z.boolean(),
});

/**
 * The question asked for values computed over listings, such as a count, an
 * average or one value per town. There are no property ids to cite, only the
 * number of listings the values were computed from.
 */
export const sqlAggregateResponseSchema = z.object({
  kind: z.literal('aggregate'),
  ...answeredBase,
  /** One entry per result row, named by the columns the query chose. */
  values: z.array(sqlRowSchema),
  /** How many rows the values were computed from: listings, for a query over the property tables. */
  listingCount: z.number().int().nonnegative(),
});

/** Response body of `POST /sql` when the question was answered. */
export const sqlResponseSchema = z.discriminatedUnion('kind', [
  sqlRowsResponseSchema,
  sqlAggregateResponseSchema,
]);

/** Machine readable codes on a 422 from `POST /sql`. */
export const SQL_ERROR_CODE = {
  /** The validator refused the generated query. `reason` says which rule. */
  REJECTED: 'E_SQL_REJECTED',
  /** The model said the data cannot answer the question. */
  DECLINED: 'E_SQL_DECLINED',
  /** The query and its one correction both failed in MySQL. */
  FAILED: 'E_SQL_FAILED',
} as const;

/** The part of a 422 body from `POST /sql` that the endpoint chooses. */
export const sqlErrorSchema = z.object({
  errorCode: z.enum([SQL_ERROR_CODE.REJECTED, SQL_ERROR_CODE.DECLINED, SQL_ERROR_CODE.FAILED]),
  message: z.string(),
  reason: z.string().optional(),
});

export type SqlRequest = z.infer<typeof sqlRequestSchema>;
export type SqlRow = z.infer<typeof sqlRowSchema>;
export type SqlRowsResponse = z.infer<typeof sqlRowsResponseSchema>;
export type SqlAggregateResponse = z.infer<typeof sqlAggregateResponseSchema>;
export type SqlResponse = z.infer<typeof sqlResponseSchema>;
export type SqlErrorCode = (typeof SQL_ERROR_CODE)[keyof typeof SQL_ERROR_CODE];
export type SqlError = z.infer<typeof sqlErrorSchema>;
