import type { SqlRejection, SqlShape, ValidatedSql } from '../validation/sql-validation-result.js';

/**
 * What came of asking the model for SQL. Only `valid` carries SQL that may
 * run, and that SQL is the validator's rewrite, never the model's own text.
 */
export type SqlGenerationResult =
  | { readonly status: 'valid'; readonly sql: ValidatedSql; readonly shape: SqlShape }
  | { readonly status: 'declined' }
  | {
      readonly status: 'rejected';
      readonly reason: SqlRejection;
      readonly detail: string;
      /** The model's text as extracted, so a retry can show the model what it wrote. */
      readonly candidate: string;
    };
