export type Cell = string | number | boolean | null;
export type Row = Readonly<Record<string, Cell>>;

export interface RowScore {
  readonly passed: boolean;
  readonly reason: string;
}

// A model that rounds an average to whole pounds still answered correctly.
// Integers on both sides, such as counts and ids, must match exactly.
const ROUNDING_TOLERANCE = 1;
const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;

/** MySQL sends DECIMAL as text and booleans as 1 or 0; compare them as the numbers they are. */
function normalise(cell: Cell): Cell {
  if (typeof cell === 'boolean') {
    return cell ? 1 : 0;
  }
  if (typeof cell === 'string' && NUMERIC_TEXT.test(cell)) {
    return Number(cell);
  }
  return cell;
}

function cellsMatch(expected: Cell, actual: Cell): boolean {
  const a = normalise(expected);
  const b = normalise(actual);
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isInteger(a) && Number.isInteger(b)) {
      return a === b;
    }
    return Math.abs(a - b) <= ROUNDING_TOLERANCE;
  }
  return a === b;
}

/**
 * True when every value of the reference row appears in the model's row. Column
 * names are ignored, since the model may alias `COUNT(*)` as anything, and
 * extra columns are fine. Each model cell answers for one reference value.
 */
function rowContains(actual: Row, expected: Row): boolean {
  const unused = Object.values(actual);
  return Object.values(expected).every((value) => {
    const index = unused.findIndex((cell) => cellsMatch(value, cell));
    if (index === -1) {
      return false;
    }
    unused.splice(index, 1);
    return true;
  });
}

/**
 * Judges the model's rows against the reference query's rows rather than its
 * SQL text, since many queries are right. Row counts must agree; each reference
 * row must be found in a distinct model row, in the same position when the
 * question asked for an order.
 */
export function scoreRows(
  expected: readonly Row[],
  actual: readonly Row[],
  ordered: boolean,
): RowScore {
  if (expected.length !== actual.length) {
    return {
      passed: false,
      reason: `expected ${String(expected.length)} rows, got ${String(actual.length)}`,
    };
  }

  const unused = [...actual];
  for (const [position, row] of expected.entries()) {
    const index = ordered
      ? rowContains(actual[position], row)
        ? position
        : -1
      : unused.findIndex((candidate) => rowContains(candidate, row));
    if (index === -1) {
      return {
        passed: false,
        reason: `${ordered ? `row ${String(position + 1)}` : 'a row'} ${JSON.stringify(row)} is missing`,
      };
    }
    if (!ordered) {
      unused.splice(index, 1);
    }
  }
  return { passed: true, reason: `${String(expected.length)} rows match` };
}
