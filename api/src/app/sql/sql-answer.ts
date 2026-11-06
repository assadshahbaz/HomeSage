import type { SqlRow } from '../../contracts/index.js';
import type { SqlShape } from './validation/sql-validation-result.js';

/** What a question's SQL answered: listings, or values computed over listings. */
export type SqlAnswer =
  | { readonly kind: 'rows'; readonly rows: SqlRow[]; readonly ordered: boolean }
  | { readonly kind: 'aggregate'; readonly values: SqlRow[]; readonly listingCount: number };

/**
 * Reads the rows a validated query returned as the answer its shape says they
 * are. For an aggregate, the count column the validator appended is summed
 * into `listingCount` and taken out of the values, so the caller sees only what
 * the question asked for.
 */
export function toSqlAnswer(shape: SqlShape, rows: readonly SqlRow[]): SqlAnswer {
  if (shape.kind === 'rows') {
    return { kind: 'rows', rows: [...rows], ordered: shape.ordered };
  }

  let listingCount = 0;
  const values = rows.map((row) => {
    const { [shape.countColumn]: count, ...rest } = row;
    const counted = Number(count);
    if (!Number.isInteger(counted) || counted < 0) {
      throw new Error(`aggregate row has no usable ${shape.countColumn}: ${String(count)}`);
    }
    listingCount += counted;
    return rest;
  });
  return { kind: 'aggregate', values, listingCount };
}
