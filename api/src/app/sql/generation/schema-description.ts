import { allowedTables, SQL_ALLOW_LIST, SQL_JOIN } from '../validation/sql-allow-list.js';
import type { AllowedTable } from '../validation/sql-allow-list.js';

/** The join the model is told to write, built from the one join key. */
export function joinClause(): string {
  const { left, right } = SQL_JOIN;
  const leftAlias = SQL_ALLOW_LIST[left.table].alias;
  const rightAlias = SQL_ALLOW_LIST[right.table].alias;
  return `LEFT JOIN ${right.table} ${rightAlias} ON ${rightAlias}.${right.column} = ${leftAlias}.${left.column}`;
}

function describeTable([name, table]: [string, AllowedTable]): string {
  const lines = Object.entries(table.columns).map(
    ([column, { type, nullable, note }]) =>
      `- ${column} ${type}${nullable ? ' NULL' : ''}: ${note}`,
  );
  return [`Table ${name} AS ${table.alias}: ${table.summary}.`, ...lines].join('\n');
}

/**
 * The schema description fed into the text to SQL prompt. Generated from the
 * allow list, so a column the model is shown is always a column the validator
 * accepts.
 */
export function describeSchema(): string {
  const tables = Object.entries(SQL_ALLOW_LIST).map(describeTable);
  const reading = [
    'Reading the data:',
    'A false flag means the listing did not mention the feature, not that the property lacks it, so a false flag never proves an absence.',
    "An answer of 'unknown' means the seller did not answer. It is not a no.",
    'Nothing is estimated. A missing floor area or council tax band is NULL and is never filled in.',
    'There are no coordinates, so a location filter uses post_code, postcode_district or town only.',
    'There is no listing date, so nothing says when a listing appeared or how long it has been on the market.',
    `Not every listing has a disclosure row, so join with ${joinClause()}. A disclosure condition in WHERE keeps only listings whose answer matches, which is right when the question filters on that answer and wrong when it only asks to show it.`,
  ].join('\n');
  return [
    `The database holds these tables and nothing else: ${allowedTables().join(', ')}. A query may read only the columns listed below.`,
    ...tables,
    reading,
  ].join('\n\n');
}
