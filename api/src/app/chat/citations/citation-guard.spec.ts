import {
  CitationGuard,
  guardCitations,
  MARKER_HOLD_MAX,
  STRIPPED_REASON,
} from './citation-guard.js';
import type { AllowedCitations, StrippedMarker } from './citation-guard.js';

const LARKFIELD_RISE = '1207';
const ELLON_FLAT = '1342';
const INVENTED = '9999';

const PROPERTIES: AllowedCitations = {
  kind: 'properties',
  ids: new Set([LARKFIELD_RISE, ELLON_FLAT]),
};
const AGGREGATE: AllowedCitations = { kind: 'aggregate' };

interface Case {
  readonly name: string;
  readonly text: string;
  readonly allowed?: AllowedCitations;
  readonly expected: string;
  readonly cited?: string[];
  readonly citedSql?: boolean;
  readonly stripped?: StrippedMarker[];
}

const CASES: readonly Case[] = [
  {
    name: 'an answer that cites nothing',
    text: 'No listing in the data matches.',
    expected: 'No listing in the data matches.',
  },
  {
    name: 'an answer that cites everything',
    text: 'A garden [P-1207] and a garage [P-1342].',
    expected: 'A garden [P-1207] and a garage [P-1342].',
    cited: [LARKFIELD_RISE, ELLON_FLAT],
  },
  {
    name: 'an invented id, with the space before it',
    text: 'A garden [P-1207] and a pool [P-9999].',
    expected: 'A garden [P-1207] and a pool.',
    cited: [LARKFIELD_RISE],
    stripped: [{ marker: `[P-${INVENTED}]`, reason: STRIPPED_REASON.UNKNOWN_ID }],
  },
  {
    name: 'a repeated id, cited once',
    text: '[P-1342] has a garden. [P-1207] too. [P-1342] is cheaper.',
    expected: '[P-1342] has a garden. [P-1207] too. [P-1342] is cheaper.',
    cited: [ELLON_FLAT, LARKFIELD_RISE],
  },
  {
    name: 'a marker at the very start and the very end',
    text: '[P-1207] has a garden, as does [P-1342]',
    expected: '[P-1207] has a garden, as does [P-1342]',
    cited: [LARKFIELD_RISE, ELLON_FLAT],
  },
  {
    name: 'adjacent markers, one invented',
    text: 'Both have gardens [P-1207][P-9999][P-1342].',
    expected: 'Both have gardens [P-1207][P-1342].',
    cited: [LARKFIELD_RISE, ELLON_FLAT],
    stripped: [{ marker: '[P-9999]', reason: STRIPPED_REASON.UNKNOWN_ID }],
  },
  {
    name: 'a marker with no id',
    text: 'A garden [P-].',
    expected: 'A garden.',
    stripped: [{ marker: '[P-]', reason: STRIPPED_REASON.MALFORMED }],
  },
  {
    name: 'a marker with letters in its id',
    text: 'A garden [P-12a].',
    expected: 'A garden.',
    stripped: [{ marker: '[P-12a]', reason: STRIPPED_REASON.MALFORMED }],
  },
  {
    name: 'several ids in one marker',
    text: 'Gardens [P-1207, P-1342].',
    expected: 'Gardens.',
    stripped: [{ marker: '[P-1207, P-1342]', reason: STRIPPED_REASON.MALFORMED }],
  },
  {
    name: 'a marker broken by a line break',
    text: 'A garden [P-12\nNext line.',
    expected: 'A garden\nNext line.',
    stripped: [{ marker: '[P-12', reason: STRIPPED_REASON.MALFORMED }],
  },
  {
    name: 'a marker cut off by the end of the answer',
    text: 'A garden [P-120',
    expected: 'A garden',
    stripped: [{ marker: '[P-120', reason: STRIPPED_REASON.MALFORMED }],
  },
  {
    name: 'a marker opened inside another',
    text: 'A garden [P-1[P-1207].',
    expected: 'A garden [P-1207].',
    cited: [LARKFIELD_RISE],
    stripped: [{ marker: '[P-1', reason: STRIPPED_REASON.MALFORMED }],
  },
  {
    name: 'spaces inside the brackets, sent plain',
    text: 'A garden [ P-1207 ] and a garage [ P-1342].',
    expected: 'A garden [P-1207] and a garage [P-1342].',
    cited: [LARKFIELD_RISE, ELLON_FLAT],
  },
  {
    name: 'an invented id with spaces inside the brackets',
    text: 'A pool [ P-9999 ].',
    expected: 'A pool.',
    stripped: [{ marker: '[ P-9999 ]', reason: STRIPPED_REASON.UNKNOWN_ID }],
  },
  {
    name: '[SQL] with spaces inside the brackets in an aggregate turn',
    text: 'There are 53 listings [ SQL ].',
    allowed: AGGREGATE,
    expected: 'There are 53 listings [SQL].',
    citedSql: true,
  },
  {
    name: 'spaced brackets that are not a marker',
    text: 'A [ note ] and [  ] here.',
    expected: 'A [ note ] and [  ] here.',
  },
  {
    name: '[SQL] in a property turn',
    text: 'There are two [SQL].',
    expected: 'There are two.',
    stripped: [{ marker: '[SQL]', reason: STRIPPED_REASON.SQL_IN_PROPERTY_TURN }],
  },
  {
    name: '[SQL] in an aggregate turn',
    text: 'There are 53 listings [SQL].',
    allowed: AGGREGATE,
    expected: 'There are 53 listings [SQL].',
    citedSql: true,
  },
  {
    name: 'a property marker in an aggregate turn',
    text: 'There are 53 listings [SQL], such as [P-1207].',
    allowed: AGGREGATE,
    expected: 'There are 53 listings [SQL], such as.',
    citedSql: true,
    stripped: [{ marker: '[P-1207]', reason: STRIPPED_REASON.PROPERTY_IN_AGGREGATE_TURN }],
  },
  {
    name: 'brackets that are not a marker',
    text: 'A [note] on [Price] and [S].',
    expected: 'A [note] on [Price] and [S].',
  },
  { name: 'a lone bracket at the end', text: 'Prices vary [', expected: 'Prices vary [' },
  {
    name: 'a bracket then a marker',
    text: 'See [[P-1207]]',
    expected: 'See [[P-1207]]',
    cited: [LARKFIELD_RISE],
  },
  {
    name: 'spaces kept where no marker is removed',
    text: 'Two  spaces  here ',
    expected: 'Two  spaces  here ',
  },
  {
    name: 'a malformed marker longer than the hold',
    text: `A garden [P-${'1'.repeat(MARKER_HOLD_MAX)}] here.`,
    expected: 'A garden11] here.',
    stripped: [
      { marker: `[P-${'1'.repeat(MARKER_HOLD_MAX - 2)}`, reason: STRIPPED_REASON.MALFORMED },
    ],
  },
];

// A fixed seed, so a failing chunking can be replayed.
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function chunked(text: string, next: () => number): string[] {
  const chunks: string[] = [];
  let at = 0;
  while (at < text.length) {
    const size = 1 + Math.floor(next() * 6);
    chunks.push(text.slice(at, at + size));
    at += size;
  }
  return chunks;
}

function streamed(chunks: readonly string[], allowed: AllowedCitations): string {
  const guard = new CitationGuard(allowed);
  return chunks.map((chunk) => guard.push(chunk)).join('') + guard.flush();
}

describe('CitationGuard', () => {
  describe.each(CASES)(
    '$name',
    ({ text, allowed = PROPERTIES, expected, cited = [], citedSql = false, stripped = [] }) => {
      it('guards the whole text', () => {
        expect(guardCitations(text, allowed)).toEqual({
          text: expected,
          citedIds: cited,
          citedSql,
          stripped,
        });
      });

      it('gives the same text one character at a time', () => {
        expect(streamed(Array.from(text), allowed)).toBe(expected);
      });

      it('gives the same text for any chunking', () => {
        const next = random(text.length);
        for (let run = 0; run < 50; run++) {
          expect(streamed(chunked(text, next), allowed)).toBe(expected);
        }
      });
    },
  );

  it('judges an id split across two chunks whole', () => {
    const guard = new CitationGuard(PROPERTIES);

    expect(guard.push('A garden [P-12')).toBe('A garden');
    expect(guard.push('07] here.')).toBe(' [P-1207] here.');
    expect(guard.citedIds).toEqual([LARKFIELD_RISE]);
  });

  it('judges an id split across three chunks whole, and removes it when unknown', () => {
    const guard = new CitationGuard(PROPERTIES);

    const out = [guard.push('A pool [P'), guard.push('-99'), guard.push('99].'), guard.flush()];

    expect(out).toEqual(['A pool', '', '.', '']);
    expect(guard.stripped).toEqual([{ marker: '[P-9999]', reason: STRIPPED_REASON.UNKNOWN_ID }]);
  });

  it('holds back only what could still become a marker', () => {
    const guard = new CitationGuard(PROPERTIES);

    expect(guard.push('Under £200k [')).toBe('Under £200k');
    expect(guard.push('roughly]')).toBe(' [roughly]');
  });

  it('releases a marker held at the end of the stream only on flush', () => {
    const guard = new CitationGuard(PROPERTIES);

    expect(guard.push('A garden [P-1207')).toBe('A garden');
    expect(guard.push(']')).toBe(' [P-1207]');
    expect(guard.flush()).toBe('');
  });
});
