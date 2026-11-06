/** What one turn may cite: the properties it retrieved, or its one aggregate result. */
export type AllowedCitations =
  | { readonly kind: 'properties'; readonly ids: ReadonlySet<string> }
  | { readonly kind: 'aggregate' };

/** Why the guard removed a marker. */
export const STRIPPED_REASON = {
  /** A well formed property marker whose id this turn did not retrieve. */
  UNKNOWN_ID: 'unknown_id',
  /** `[P-` followed by something other than digits, or never closed. */
  MALFORMED: 'malformed',
  /** `[SQL]` in a turn that retrieved properties, not an aggregate. */
  SQL_IN_PROPERTY_TURN: 'sql_in_property_turn',
  /** Any property marker in an aggregate turn, which retrieved no property. */
  PROPERTY_IN_AGGREGATE_TURN: 'property_in_aggregate_turn',
} as const;

export type StrippedReason = (typeof STRIPPED_REASON)[keyof typeof STRIPPED_REASON];

/** A marker the guard removed, as the model wrote it, and why. */
export interface StrippedMarker {
  readonly marker: string;
  readonly reason: StrippedReason;
}

/**
 * The most the guard holds back while it decides whether text is a marker.
 * A real marker is at most `[P-` and a few digits; the room above that lets a
 * malformed one such as `[P-1207, P-1342]` be held whole and removed whole.
 */
export const MARKER_HOLD_MAX = 32;

const PROPERTY_PREFIX = '[P-';
const SQL_MARKER = '[SQL]';
const PROPERTY_ID = /^\d+$/;
// Inside a property marker, anything up to the closing bracket except another
// bracket or a line break, which end it as malformed.
const MARKER_BODY_END = /[[\n]/;
// Spaces before a closing bracket, or at the end of a marker still open.
const SPACES_BEFORE_CLOSE = / +(?=\]?$)/;

/**
 * Removes every citation marker the turn may not make, from text that arrives
 * in chunks, before any of it reaches the client. Text that could be the
 * start of a marker (`[`, `[P-12`, `[SQ`) is held back until the next
 * character settles it, so an id split across chunks is judged whole, and the
 * output is the same however the text was chunked. Spaces just inside the
 * brackets are allowed and a kept marker is sent plain. A removed marker takes the
 * spaces before it, so "a garden [P-9999]." reads "a garden.". Pure: no I/O,
 * one instance per answer.
 */
export class CitationGuard {
  private held = '';
  private spaces = '';
  private released = '';
  private readonly cited = new Set<string>();
  private sqlCited = false;
  private readonly removed: StrippedMarker[] = [];

  public constructor(private readonly allowed: AllowedCitations) {}

  /** Takes the next chunk and returns the text that is safe to send now. */
  public push(chunk: string): string {
    for (const character of chunk) {
      this.take(character);
    }
    return this.drain();
  }

  /** Settles whatever is still held once the answer has ended, and returns the rest. */
  public flush(): string {
    this.settleHeld();
    this.released += this.spaces;
    this.spaces = '';
    return this.drain();
  }

  /** The property ids cited so far, each once, in order of first citation. */
  public get citedIds(): string[] {
    return [...this.cited];
  }

  /** Whether a `[SQL]` marker survived. */
  public get citedSql(): boolean {
    return this.sqlCited;
  }

  /** Every marker removed so far, in order. */
  public get stripped(): readonly StrippedMarker[] {
    return this.removed;
  }

  private take(character: string): void {
    if (this.held === '') {
      if (character === '[') {
        this.held = character;
      } else {
        this.emit(character);
      }
      return;
    }

    const raw = this.held + character;
    const shape = markerShape(raw);
    if (raw.length > MARKER_HOLD_MAX && !shape.startsWith(PROPERTY_PREFIX)) {
      this.release(raw);
      return;
    }
    if (shape === '[') {
      this.held = raw;
      return;
    }
    if (shape.startsWith(PROPERTY_PREFIX)) {
      if (character === ']') {
        this.held = '';
        this.decideProperty(raw, shape);
      } else if (MARKER_BODY_END.test(character)) {
        // Never closed, so it cannot be checked: removed, and the character
        // that broke it is read again on its own. A bracket may open the
        // marker that was meant, so the spaces before stay for it.
        this.strip(this.held, STRIPPED_REASON.MALFORMED, character !== '[');
        this.held = '';
        this.take(character);
      } else if (raw.length > MARKER_HOLD_MAX) {
        this.strip(raw, STRIPPED_REASON.MALFORMED);
        this.held = '';
      } else {
        this.held = raw;
      }
      return;
    }
    const sqlShape = shape.replace(SPACES_BEFORE_CLOSE, '');
    if (sqlShape === SQL_MARKER) {
      this.held = '';
      this.decideSql(raw);
      return;
    }
    if (PROPERTY_PREFIX.startsWith(shape) || SQL_MARKER.startsWith(sqlShape)) {
      this.held = raw;
      return;
    }
    // Not a marker after all: what was held is text, and this character is
    // read again, since it may itself open a marker.
    this.held = '';
    this.release(raw.slice(0, -character.length));
    this.take(character);
  }

  private release(text: string): void {
    this.held = '';
    for (const character of text) {
      this.emit(character);
    }
  }

  // Sent in its plain form, so a client reads every kept marker the same way.
  private decideProperty(raw: string, shape: string): void {
    const id = shape.slice(PROPERTY_PREFIX.length, -1).trim();
    if (this.allowed.kind === 'aggregate') {
      this.strip(raw, STRIPPED_REASON.PROPERTY_IN_AGGREGATE_TURN);
    } else if (!PROPERTY_ID.test(id)) {
      this.strip(raw, STRIPPED_REASON.MALFORMED);
    } else if (!this.allowed.ids.has(id)) {
      this.strip(raw, STRIPPED_REASON.UNKNOWN_ID);
    } else {
      this.cited.add(id);
      this.keep(`${PROPERTY_PREFIX}${id}]`);
    }
  }

  private decideSql(raw: string): void {
    if (this.allowed.kind === 'aggregate') {
      this.sqlCited = true;
      this.keep(SQL_MARKER);
    } else {
      this.strip(raw, STRIPPED_REASON.SQL_IN_PROPERTY_TURN);
    }
  }

  private settleHeld(): void {
    if (this.held === '') {
      return;
    }
    const text = this.held;
    this.held = '';
    if (markerShape(text).startsWith(PROPERTY_PREFIX)) {
      this.strip(text, STRIPPED_REASON.MALFORMED);
      return;
    }
    this.release(text);
  }

  // Spaces are held until the next character shows whether a removed marker follows them.
  private emit(character: string): void {
    if (character === ' ') {
      this.spaces += character;
      return;
    }
    this.released += this.spaces + character;
    this.spaces = '';
  }

  private keep(marker: string): void {
    this.released += this.spaces + marker;
    this.spaces = '';
  }

  private strip(marker: string, reason: StrippedReason, takeSpaces = true): void {
    this.removed.push({ marker, reason });
    if (takeSpaces) {
      this.spaces = '';
    }
  }

  private drain(): string {
    const text = this.released;
    this.released = '';
    return text;
  }
}

// Spaces just inside the opening bracket do not change what a marker is: a
// model has been seen writing "[ P-3468 ]" for "[P-3468]".
function markerShape(held: string): string {
  return `[${held.slice(1).trimStart()}`;
}

/** The guard over a finished text: its guarded form, what it cited and what was removed. */
export function guardCitations(
  text: string,
  allowed: AllowedCitations,
): {
  readonly text: string;
  readonly citedIds: string[];
  readonly citedSql: boolean;
  readonly stripped: readonly StrippedMarker[];
} {
  const guard = new CitationGuard(allowed);
  const guarded = guard.push(text) + guard.flush();
  return {
    text: guarded,
    citedIds: guard.citedIds,
    citedSql: guard.citedSql,
    stripped: guard.stripped,
  };
}
