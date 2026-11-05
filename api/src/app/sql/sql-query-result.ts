import type { SqlAnswer } from './sql-answer.js';
import type { SqlRejection, ValidatedSql } from './validation/sql-validation-result.js';

/** What came of answering a question with SQL, end to end. */
export type SqlQueryResult =
  | {
      readonly status: 'answered';
      readonly sql: ValidatedSql;
      readonly answer: SqlAnswer;
      /** True when the first query failed in MySQL and the model's correction ran instead. */
      readonly corrected: boolean;
    }
  | { readonly status: 'declined' }
  | { readonly status: 'rejected'; readonly reason: SqlRejection; readonly detail: string };
