/** Why the validator refused a generated query. */
export const SQL_REJECTION = {
  PARSE_ERROR: 'parse_error',
  MULTIPLE_STATEMENTS: 'multiple_statements',
  NOT_SELECT: 'not_select',
  SET_OPERATION: 'set_operation',
  TABLE_NOT_ALLOWED: 'table_not_allowed',
  COLUMN_NOT_ALLOWED: 'column_not_allowed',
  FUNCTION_NOT_ALLOWED: 'function_not_allowed',
  VARIABLE: 'variable',
  INTO: 'into',
  LOCKING_READ: 'locking_read',
  INVALID_LIMIT: 'invalid_limit',
  MIXED_AGGREGATE: 'mixed_aggregate',
} as const;

export type SqlRejection = (typeof SQL_REJECTION)[keyof typeof SQL_REJECTION];

declare const VALIDATED: unique symbol;

/**
 * SQL the validator produced. Only the validator can make one, so a function
 * that takes `ValidatedSql` cannot be handed model output that skipped it.
 */
export type ValidatedSql = string & { readonly [VALIDATED]: true };

/**
 * What kind of answer a validated query gives, read from its parse tree rather
 * than from anything the model says. `rows` lists listings, in SQL order when
 * `ordered`. `aggregate` computes values over listings; its SQL carries one
 * extra column, `countColumn`, holding how many rows each result row was
 * computed from.
 */
export type SqlShape =
  | { readonly kind: 'rows'; readonly ordered: boolean }
  | { readonly kind: 'aggregate'; readonly countColumn: string };

/**
 * The validator's verdict. A rejection is a value rather than an exception, so
 * the caller can hand the reason back to the model for one corrected attempt.
 */
export type SqlValidationResult =
  | { readonly ok: true; readonly sql: ValidatedSql; readonly shape: SqlShape }
  | { readonly ok: false; readonly reason: SqlRejection; readonly detail: string };
