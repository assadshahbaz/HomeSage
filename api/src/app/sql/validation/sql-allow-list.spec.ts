import { readFileSync } from 'node:fs';
import { repoPath } from '../../../../tools/repo-path.js';
import {
  allowedColumns,
  allowedTables,
  isAllowedColumn,
  isAllowedTable,
  SQL_ALLOW_LIST,
  SQL_JOIN,
  type AllowedTable,
  type AllowedTableName,
} from './sql-allow-list.js';

// Checkouts on Windows carry CRLF, so normalise before anything matches on line ends.
const schemaDoc = readFileSync(repoPath('docs/schema.md'), 'utf8').replace(/\r\n/g, '\n');

/** The one row in the doc that stands for a group of columns rather than one. */
const DETAIL_GROUP_ROW = /^\d+ `\*_detail` columns$/;
const COLUMN_CELL = /^`([a-z0-9_]+)`$/;
const NULL_CELL = /^(no|yes)$/;

interface DocumentedColumn {
  allowed: boolean;
  nullable: boolean;
}

/** The detail columns the doc spells out in a sentence rather than in the table. */
function detailColumnSentence(): { stated: number; names: string[] } {
  const sentence = /^The (\d+) detail columns in full, in table order: (.+)$/m.exec(schemaDoc);
  if (!sentence) {
    throw new Error('docs/schema.md no longer lists the detail columns in full');
  }
  return {
    stated: Number(sentence[1]),
    names: [...sentence[2].matchAll(/`([a-z0-9_]+)`/g)].map((match) => match[1]),
  };
}

function namesInCell(cell: string): string[] {
  if (DETAIL_GROUP_ROW.test(cell)) {
    return detailColumnSentence().names;
  }
  const single = COLUMN_CELL.exec(cell);
  if (!single) {
    throw new Error(`docs/schema.md has a column cell this test cannot read: ${cell}`);
  }
  return [single[1]];
}

/** Reads one table's column table out of `docs/schema.md`. */
function documentedColumns(table: string): Map<string, DocumentedColumn> {
  const section = new RegExp(`^## Table: ${table}\\n([\\s\\S]*?)\\n## `, 'm').exec(schemaDoc);
  if (!section) {
    throw new Error(`docs/schema.md has no section for ${table}`);
  }

  const columns = new Map<string, DocumentedColumn>();
  for (const line of section[1].split('\n')) {
    if (!line.startsWith('|') || line.startsWith('| Column') || line.startsWith('|---')) {
      continue;
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    const nullCell = cells[2];
    const sqlCell = cells[cells.length - 1];
    if (!NULL_CELL.test(nullCell) || (sqlCell !== 'yes' && sqlCell !== 'no')) {
      throw new Error(`docs/schema.md has a row this test cannot read: ${line}`);
    }
    for (const name of namesInCell(cells[0])) {
      columns.set(name, { allowed: sqlCell === 'yes', nullable: nullCell !== 'no' });
    }
  }
  return columns;
}

const documented = new Map<AllowedTableName, Map<string, DocumentedColumn>>(
  allowedTables().map((table) => [table, documentedColumns(table)]),
);

function documentedNames(table: AllowedTableName, allowed: boolean): string[] {
  return [...documented.get(table)!]
    .filter(([, column]) => column.allowed === allowed)
    .map(([name]) => name);
}

describe('the allow list against docs/schema.md', () => {
  it('reads as many detail columns as the doc says there are', () => {
    const { stated, names } = detailColumnSentence();
    expect(names).toHaveLength(stated);
    expect(new Set(names).size).toBe(stated);
  });

  it.each(allowedTables())('allows exactly the columns %s marks yes', (table: AllowedTableName) => {
    expect(allowedColumns(table)).toEqual(documentedNames(table, true));
  });

  it.each(allowedTables())(
    'keeps every column %s marks no off the allow list',
    (table: AllowedTableName) => {
      const excluded = documentedNames(table, false);
      expect(excluded.length).toBeGreaterThan(0);
      expect(excluded.filter((name) => isAllowedColumn(name, table))).toEqual([]);
    },
  );

  it.each(allowedTables())(
    'matches the doc on which columns of %s are nullable',
    (table: AllowedTableName) => {
      const columns = documented.get(table)!;
      const fromDoc = documentedNames(table, true).map((name) => [
        name,
        columns.get(name)!.nullable,
      ]);
      const allowed: AllowedTable = SQL_ALLOW_LIST[table];
      const fromAllowList = Object.entries(allowed.columns).map(
        ([name, column]) => [name, column.nullable] as const,
      );
      expect(fromAllowList).toEqual(fromDoc);
    },
  );

  it('keeps the columns the doc argues against out, whichever table they are on', () => {
    const excluded = [
      'house_floor',
      'created_at',
      'updated_at',
      'parking_arrangements',
      'gas_supplier',
      ...detailColumnSentence().names,
    ];
    const documentedNo = allowedTables().flatMap((table) => documentedNames(table, false));
    expect(excluded.filter((name) => !documentedNo.includes(name))).toEqual([]);
    expect(excluded.filter((name) => isAllowedColumn(name))).toEqual([]);
  });

  it('joins on the key the doc calls the only relationship', () => {
    expect(schemaDoc).toContain(
      `${SQL_JOIN.left.table}.${SQL_JOIN.left.column} = ${SQL_JOIN.right.table}.${SQL_JOIN.right.column}`,
    );
  });
});

describe('isAllowedTable', () => {
  it('accepts the two property tables', () => {
    expect(allowedTables().every(isAllowedTable)).toBe(true);
  });

  it.each(['information_schema', 'mysql', 'performance_schema', 'users', 'PROPERTIES'])(
    'rejects %s',
    (table) => {
      expect(isAllowedTable(table)).toBe(false);
    },
  );
});

describe('isAllowedColumn', () => {
  it('accepts a column of either table when the query does not qualify it', () => {
    expect(isAllowedColumn('price')).toBe(true);
    expect(isAllowedColumn('central_heating')).toBe(true);
  });

  it('rejects a column that belongs to the other table', () => {
    expect(isAllowedColumn('price', 'property_disclosures')).toBe(false);
    expect(isAllowedColumn('central_heating', 'properties')).toBe(false);
  });

  it('rejects a column the model invented', () => {
    expect(isAllowedColumn('epc_rating')).toBe(false);
    expect(isAllowedColumn('latitude')).toBe(false);
    expect(isAllowedColumn('password')).toBe(false);
  });

  it('rejects any column on a table that is not allowed', () => {
    expect(isAllowedColumn('price', 'information_schema.tables')).toBe(false);
  });

  it('rejects a property of Object that is not a column', () => {
    expect(isAllowedColumn('toString', 'properties')).toBe(false);
    expect(isAllowedColumn('constructor')).toBe(false);
  });
});
