import sqlParser from 'node-sql-parser';
import type { AST } from 'node-sql-parser';
import { isRecord } from '../../../contracts/index.js';
import { isAllowedColumn, isAllowedTable } from './sql-allow-list.js';
import type { AllowedTableName } from './sql-allow-list.js';
import { SQL_REJECTION } from './sql-validation-result.js';
import type {
  SqlRejection,
  SqlShape,
  SqlValidationResult,
  ValidatedSql,
} from './sql-validation-result.js';

const { Parser } = sqlParser;

const DIALECT = { database: 'MySQL' } as const;

/**
 * Functions a generated query may call. An allow list rather than a deny list,
 * so a function nobody thought to forbid (`LOAD_FILE`, `SLEEP`, `BENCHMARK`,
 * `GET_LOCK`, `DATABASE`) is refused by default.
 */
const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'GROUP_CONCAT',
  'ROUND',
  'FLOOR',
  'CEIL',
  'CEILING',
  'ABS',
  'MOD',
  'LOWER',
  'UPPER',
  'CONCAT',
  'CONCAT_WS',
  'LENGTH',
  'CHAR_LENGTH',
  'SUBSTRING',
  'SUBSTR',
  'LEFT',
  'RIGHT',
  'TRIM',
  'REPLACE',
  'LOCATE',
  'INSTR',
  'COALESCE',
  'IFNULL',
  'NULLIF',
  'IF',
  'GREATEST',
  'LEAST',
  'EXISTS',
]);

/** Functions a generated query may call, for the prompt to list, in allow list order. */
export function allowedFunctions(): readonly string[] {
  return [...ALLOWED_FUNCTIONS];
}

// The parser's own types are mostly `any`, so the AST is walked as untrusted data.
// The fields named here are the ones the validator reads; every other field is
// still walked through the index signature.
interface AstNode {
  [key: string]: unknown;
  type?: unknown;
  ast?: unknown;
  expr?: unknown;
  name?: unknown;
  value?: unknown;
  as?: unknown;
  db?: unknown;
  schema?: unknown;
  table?: unknown;
  column?: unknown;
  columns?: unknown;
  stmt?: unknown;
  on?: unknown;
  using?: unknown;
  from?: unknown;
  with?: unknown;
  into?: unknown;
  keyword?: unknown;
  orderby?: unknown;
  limit?: unknown;
  seperator?: unknown;
  set_op?: unknown;
  locking_read?: unknown;
  groupby?: unknown;
  over?: unknown;
  _next?: unknown;
  _limit?: unknown;
}

/** Where a name in FROM points: an allow listed table, or a subquery or CTE with known columns. */
type Source =
  | { readonly kind: 'table'; readonly table: AllowedTableName }
  | { readonly kind: 'derived'; readonly columns: ReadonlySet<string> };

/** The names one SELECT can see, chained to the enclosing SELECT for correlated subqueries. */
interface Scope {
  readonly sources: ReadonlyMap<string, Source>;
  readonly ctes: ReadonlyMap<string, ReadonlySet<string>>;
  readonly parent?: Scope;
}

const NO_ALIASES: ReadonlySet<string> = new Set();

// The column an aggregate query's listing count comes back in. Named so it
// cannot be mistaken for a value the model asked for.
const LISTING_COUNT_COLUMN = 'homesage_listing_count';

// Grouping by one of these is one group per listing, so the rows are listings.
const LISTING_ID_COLUMNS: ReadonlySet<string> = new Set(['id', 'property_id']);

class Rejection extends Error {
  public constructor(
    public readonly reason: SqlRejection,
    detail: string,
  ) {
    super(detail);
  }
}

function isNode(value: unknown): value is AstNode {
  return isRecord(value);
}

/** True for a node that starts a subquery, whose aggregates and columns are its own. */
function isSubquery(node: AstNode): boolean {
  return isNode(node.ast) || node.type === 'select';
}

/**
 * True when an expression computes an aggregate over rows. A window function
 * (an aggregate with OVER) gives one value per row, so it does not count.
 */
function containsAggregate(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some((child) => containsAggregate(child));
  }
  if (!isNode(node) || isSubquery(node)) {
    return false;
  }
  if (node.type === 'aggr_func' && !node.over) {
    return true;
  }
  return Object.values(node).some((child) => containsAggregate(child));
}

/** True when an expression reads a column outside any aggregate, so it varies row by row. */
function hasPlainColumn(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some((child) => hasPlainColumn(child));
  }
  if (!isNode(node) || isSubquery(node) || (node.type === 'aggr_func' && !node.over)) {
    return false;
  }
  if (node.type === 'column_ref') {
    return true;
  }
  return Object.values(node).some((child) => hasPlainColumn(child));
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Newer parser versions wrap identifiers as `{ expr: { value } }` rather than a plain string. */
function identifier(value: unknown): string | undefined {
  if (isNode(value) && isNode(value.expr)) {
    return asString(value.expr.value);
  }
  return isNode(value) ? asString(value.value) : asString(value);
}

function functionName(node: AstNode): string {
  if (typeof node.name === 'string') {
    return node.name.toUpperCase();
  }
  const parts = isNode(node.name) && Array.isArray(node.name.name) ? node.name.name : [];
  return parts
    .map((part) => identifier(part) ?? '')
    .join('.')
    .toUpperCase();
}

function sourceHas(source: Source, column: string): boolean {
  return source.kind === 'table'
    ? isAllowedColumn(column, source.table)
    : source.columns.has(column);
}

function findSource(scope: Scope | undefined, name: string): Source | undefined {
  for (let current = scope; current; current = current.parent) {
    const source = current.sources.get(name);
    if (source) {
      return source;
    }
  }
  return undefined;
}

/**
 * Decides whether model written SQL may run, and rewrites it so it is safe to.
 * It has no dependency on Nest, the model or MySQL, and returns SQL printed
 * from the parsed tree rather than the text it was given, so anything the
 * parser skipped, such as a MySQL `/*! ... *\/` comment that the server would
 * execute, never reaches the database.
 */
export class SqlValidator {
  private readonly parser = new Parser();

  public constructor(private readonly rowLimit: number) {}

  /** Checks one generated query against every rule, and caps its row count. */
  public validate(sql: string): SqlValidationResult {
    let parsed: AST | AST[];
    try {
      parsed = this.parser.astify(sql, DIALECT);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: SQL_REJECTION.PARSE_ERROR, detail: message };
    }

    const statements: AST[] = Array.isArray(parsed) ? parsed : [parsed];
    if (statements.length === 0) {
      return { ok: false, reason: SQL_REJECTION.PARSE_ERROR, detail: 'no statement found' };
    }
    if (statements.length > 1) {
      return {
        ok: false,
        reason: SQL_REJECTION.MULTIPLE_STATEMENTS,
        detail: `expected one statement, found ${statements.length}`,
      };
    }

    const [statement] = statements;
    // Walked through a loose view of the same object, so the LIMIT rewrite shows up in `sqlify`.
    const select: unknown = statement;
    if (!isNode(select) || select.type !== 'select') {
      const type = typeof statement.type === 'string' ? statement.type : 'unknown';
      return {
        ok: false,
        reason: SQL_REJECTION.NOT_SELECT,
        detail: `only SELECT may run, found ${type.toUpperCase()}`,
      };
    }

    let shape: SqlShape;
    try {
      this.checkSelect(select, undefined, new Map());
      shape = this.classify(select);
      this.capLimit(select);
    } catch (error) {
      // A rule broken deep in the tree unwinds to here and becomes the verdict.
      if (error instanceof Rejection) {
        return { ok: false, reason: error.reason, detail: error.message };
      }
      throw error;
    }

    // The one place a string becomes `ValidatedSql`: it has just passed every rule.
    return { ok: true, sql: this.parser.sqlify(statement, DIALECT) as ValidatedSql, shape };
  }

  /**
   * Reads what kind of answer the query gives. A GROUP BY or an aggregate in
   * the select list makes it an aggregate, unless it groups by the listing id,
   * which is still one row per listing. An aggregate query gets a COUNT(*)
   * appended, so MySQL reports in the same pass how many rows sit behind each
   * value, whatever HAVING or LIMIT did to the groups.
   */
  private classify(select: AstNode): SqlShape {
    const columns: unknown[] = Array.isArray(select.columns) ? select.columns : [];
    const exprs = columns.map((column) => (isNode(column) ? column.expr : undefined));
    const groupBy: unknown[] =
      isNode(select.groupby) && Array.isArray(select.groupby.columns) ? select.groupby.columns : [];
    const hasAggregate = exprs.some((expr) => containsAggregate(expr));

    if (groupBy.length === 0 && hasAggregate && exprs.some((expr) => hasPlainColumn(expr))) {
      throw new Rejection(
        SQL_REJECTION.MIXED_AGGREGATE,
        'an aggregate next to a plain column needs a GROUP BY on that column',
      );
    }

    const perListing = groupBy.some(
      (column) =>
        isNode(column) &&
        column.type === 'column_ref' &&
        LISTING_ID_COLUMNS.has((identifier(column.column) ?? '').toLowerCase()),
    );
    if ((groupBy.length > 0 || hasAggregate) && !perListing) {
      columns.push({
        expr: {
          type: 'aggr_func',
          name: 'COUNT',
          args: { expr: { type: 'star', value: '*' } },
          over: null,
        },
        as: LISTING_COUNT_COLUMN,
      });
      return { kind: 'aggregate', countColumn: LISTING_COUNT_COLUMN };
    }
    return { kind: 'rows', ordered: Array.isArray(select.orderby) && select.orderby.length > 0 };
  }

  /** Checks one SELECT and returns the column names it exposes to an enclosing query. */
  private checkSelect(
    select: AstNode,
    parent: Scope | undefined,
    outerCtes: ReadonlyMap<string, ReadonlySet<string>>,
  ): ReadonlySet<string> {
    if (select._next || select.set_op || select._limit) {
      throw new Rejection(
        SQL_REJECTION.SET_OPERATION,
        'UNION, INTERSECT and EXCEPT are not allowed; use one SELECT with a join or a WHERE condition',
      );
    }
    if (isNode(select.into) && (select.into.keyword || select.into.expr)) {
      throw new Rejection(SQL_REJECTION.INTO, 'SELECT ... INTO is not allowed');
    }
    if (select.locking_read) {
      throw new Rejection(
        SQL_REJECTION.LOCKING_READ,
        `${asString(select.locking_read) ?? 'a locking read'} is not allowed; a query only reads`,
      );
    }

    const ctes = this.checkCtes(select.with, outerCtes);
    const sources = new Map<string, Source>();
    const scope: Scope = { sources, ctes, parent };
    const joinConditions = this.collectSources(select.from, sources, ctes);
    for (const condition of joinConditions) {
      this.walk(condition, scope, NO_ALIASES);
    }

    if (!Array.isArray(select.columns)) {
      throw new Rejection(SQL_REJECTION.COLUMN_NOT_ALLOWED, 'the select list could not be read');
    }
    const outputs = new Set<string>();
    for (const column of select.columns) {
      // An item the walker cannot read is refused, never skipped: skipping it
      // would let whatever it holds through unchecked.
      if (!isNode(column)) {
        throw new Rejection(
          SQL_REJECTION.COLUMN_NOT_ALLOWED,
          'a select list item could not be read',
        );
      }
      const expr = column.expr;
      this.walk(expr, scope, NO_ALIASES);
      const name =
        asString(column.as) ??
        (isNode(expr) && expr.type === 'column_ref' ? identifier(expr.column) : undefined);
      if (name) {
        outputs.add(name.toLowerCase());
      }
    }

    // MySQL resolves ORDER BY against select list aliases before table columns,
    // so an alias is safe there. WHERE, GROUP BY and HAVING look at the tables
    // first, where a same named column the allow list does not know would win.
    this.walk(select.orderby, scope, outputs);

    const handled = new Set(['with', 'from', 'columns', 'orderby', 'into', 'locking_read']);
    for (const [key, value] of Object.entries(select)) {
      if (!handled.has(key)) {
        this.walk(value, scope, NO_ALIASES);
      }
    }
    return outputs;
  }

  private checkCtes(
    withClause: unknown,
    outerCtes: ReadonlyMap<string, ReadonlySet<string>>,
  ): ReadonlyMap<string, ReadonlySet<string>> {
    const ctes = new Map(outerCtes);
    if (!Array.isArray(withClause)) {
      return ctes;
    }
    for (const cte of withClause) {
      const name = isNode(cte) ? identifier(cte.name) : undefined;
      const body = isNode(cte) && isNode(cte.stmt) ? cte.stmt.ast : undefined;
      if (!isNode(cte) || !name || !isNode(body)) {
        throw new Rejection(SQL_REJECTION.TABLE_NOT_ALLOWED, 'a WITH clause could not be read');
      }
      // The name is added only after its body is checked, so a recursive CTE
      // that reads itself finds no such table and is refused.
      const outputs = this.checkSelect(body, undefined, ctes);
      const declared = Array.isArray(cte.columns)
        ? cte.columns.map((column) => (isNode(column) ? identifier(column.column) : undefined))
        : [];
      ctes.set(
        name,
        declared.length > 0
          ? new Set(declared.map((column) => (column ?? '').toLowerCase()))
          : outputs,
      );
    }
    return ctes;
  }

  /** Registers every FROM and JOIN source, returning the ON and USING clauses to check once all are known. */
  private collectSources(
    from: unknown,
    sources: Map<string, Source>,
    ctes: ReadonlyMap<string, ReadonlySet<string>>,
  ): unknown[] {
    const conditions: unknown[] = [];
    if (!Array.isArray(from)) {
      return conditions;
    }

    for (const item of from) {
      if (!isNode(item)) {
        throw new Rejection(SQL_REJECTION.TABLE_NOT_ALLOWED, 'a FROM item could not be read');
      }
      if (item.type === 'dual') {
        continue;
      }

      const alias = asString(item.as);
      if (isNode(item.expr) && isNode(item.expr.ast)) {
        // A derived table cannot see the query around it, so it gets no parent scope.
        const columns = this.checkSelect(item.expr.ast, undefined, ctes);
        sources.set(alias ?? '', { kind: 'derived', columns });
      } else {
        const table = asString(item.table);
        const db = asString(item.db) ?? asString(item.schema);
        if (!table) {
          throw new Rejection(SQL_REJECTION.TABLE_NOT_ALLOWED, 'a FROM item could not be read');
        }
        if (db) {
          throw new Rejection(SQL_REJECTION.TABLE_NOT_ALLOWED, `${db}.${table} is not allowed`);
        }
        const cteColumns = ctes.get(table);
        if (cteColumns) {
          sources.set(alias ?? table, { kind: 'derived', columns: cteColumns });
        } else if (isAllowedTable(table)) {
          sources.set(alias ?? table, { kind: 'table', table });
        } else {
          throw new Rejection(SQL_REJECTION.TABLE_NOT_ALLOWED, `table ${table} is not allowed`);
        }
      }

      conditions.push(item.on);
      if (Array.isArray(item.using)) {
        for (const name of item.using) {
          conditions.push({ type: 'column_ref', table: null, column: identifier(name) });
        }
      }
    }
    return conditions;
  }

  /** Walks an expression of any shape, checking every column, function, variable and subquery in it. */
  private walk(node: unknown, scope: Scope, aliases: ReadonlySet<string>): void {
    if (Array.isArray(node)) {
      for (const child of node) {
        this.walk(child, scope, aliases);
      }
      return;
    }
    if (!isNode(node)) {
      return;
    }
    // A subquery in an expression arrives wrapped as `{ ast }`. It may read the
    // columns of the query around it, so its scope chains to this one.
    if (isNode(node.ast)) {
      this.checkSelect(node.ast, scope, scope.ctes);
      return;
    }

    switch (node.type) {
      case 'select':
        this.checkSelect(node, scope, scope.ctes);
        return;
      case 'column_ref':
        this.checkColumn(node, scope, aliases);
        return;
      case 'var':
      case 'assign':
        throw new Rejection(SQL_REJECTION.VARIABLE, 'user and system variables are not allowed');
      case 'function':
      case 'aggr_func': {
        const name = functionName(node);
        if (!ALLOWED_FUNCTIONS.has(name)) {
          throw new Rejection(
            SQL_REJECTION.FUNCTION_NOT_ALLOWED,
            `function ${name || '(unnamed)'} is not allowed`,
          );
        }
        break;
      }
    }

    for (const child of Object.values(node)) {
      this.walk(child, scope, aliases);
    }
  }

  private checkColumn(ref: AstNode, scope: Scope, aliases: ReadonlySet<string>): void {
    const column = identifier(ref.column);
    if (!column) {
      throw new Rejection(SQL_REJECTION.COLUMN_NOT_ALLOWED, 'a column reference could not be read');
    }
    if (column === '*') {
      throw new Rejection(
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
        'SELECT * reads columns outside the allow list; name each column',
      );
    }
    const db = asString(ref.db) ?? asString(ref.schema);
    if (db) {
      throw new Rejection(
        SQL_REJECTION.COLUMN_NOT_ALLOWED,
        `database qualified column ${db}.${String(ref.table)}.${column} is not allowed`,
      );
    }

    const name = column.toLowerCase();
    const qualifier = asString(ref.table);
    if (qualifier) {
      const source = findSource(scope, qualifier);
      if (!source || !sourceHas(source, name)) {
        throw new Rejection(
          SQL_REJECTION.COLUMN_NOT_ALLOWED,
          `column ${qualifier}.${column} is not on the allow list`,
        );
      }
      return;
    }

    if (aliases.has(name) || this.resolvesUnqualified(scope, name)) {
      return;
    }
    throw new Rejection(
      SQL_REJECTION.COLUMN_NOT_ALLOWED,
      `column ${column} is not on the allow list`,
    );
  }

  /**
   * MySQL looks for an unqualified column in the innermost query first. When
   * that query reads a real table without the column on its allow list, the
   * name may still be a real column the list keeps out, so the search stops
   * there instead of falling through to an outer query.
   */
  private resolvesUnqualified(scope: Scope, name: string): boolean {
    for (let current: Scope | undefined = scope; current; current = current.parent) {
      const sources = [...current.sources.values()];
      if (sources.some((source) => sourceHas(source, name))) {
        return true;
      }
      if (sources.some((source) => source.kind === 'table')) {
        return false;
      }
    }
    return false;
  }

  /** Adds a LIMIT when there is none and lowers one above the cap. */
  private capLimit(select: AstNode): void {
    const limit = select.limit;
    const values = isNode(limit) && Array.isArray(limit.value) ? limit.value : [];
    if (!isNode(limit) || values.length === 0) {
      select.limit = { seperator: '', value: [{ type: 'number', value: this.rowLimit }] };
      return;
    }

    // `LIMIT offset, count` puts the count second; `LIMIT count OFFSET offset` puts it first.
    const countIndex = limit.seperator === ',' ? 1 : 0;
    values.forEach((value, index) => {
      const isCount = index === countIndex;
      if (isNode(value) && value.type === 'bigint' && isCount) {
        values[index] = { type: 'number', value: this.rowLimit };
        return;
      }
      const number = isNode(value) && value.type === 'number' ? value.value : undefined;
      if (typeof number !== 'number' || !Number.isInteger(number) || number < 0) {
        throw new Rejection(
          SQL_REJECTION.INVALID_LIMIT,
          'LIMIT and OFFSET must be whole numbers written in the query',
        );
      }
      if (isCount && number > this.rowLimit) {
        values[index] = { type: 'number', value: this.rowLimit };
      }
    });
  }
}
