import { SqlValidator } from '../../src/app/sql/validation/sql-validator.ts';
import {
  GOLDEN_SLICE,
  loadGoldenSet,
  parseGoldenSet,
  requireRelevanceScored,
  requireSqlScored,
  selectEntries,
} from './golden-set.ts';
import type { GoldenEntry } from './golden-set.ts';
import { SEMANTIC_SELECTION } from './semantic-selection.ts';
import { SQL_SELECTION } from './sql-selection.ts';

const ROW_LIMIT = 50;
const PROPERTY_ID = 1234;
const OTHER_PROPERTY_ID = 2871;
const UNCERTAIN_PROPERTY_ID = 1529;

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'count-stonehaven',
    slice: 'aggregates_and_ordering',
    milestone: 'M1',
    category: 'aggregate',
    question: 'How many listings are there in Stonehaven?',
    expected: {
      kind: 'aggregate',
      reference: "SELECT COUNT(*) AS listings FROM properties p WHERE p.town = 'Stonehaven'",
    },
    ...overrides,
  };
}

const LABELLED = {
  kind: 'relevant_ids',
  ids: [PROPERTY_ID, OTHER_PROPERTY_ID],
  labelledBy: 'assadshahbaz',
  labelledOn: '2026-10-05',
};

describe('the golden set file', () => {
  const entries = loadGoldenSet();
  const sqlEntries = requireSqlScored(selectEntries(entries, SQL_SELECTION));

  it('holds the M1 questions and the two M1.1 join questions, all picked by the SQL report', () => {
    expect(entries.filter((question) => question.milestone === 'M1')).toHaveLength(20);
    expect(entries.filter((question) => question.milestone === 'M1.1')).toHaveLength(2);
    expect(sqlEntries).toHaveLength(22);
  });

  it('holds the ten M2 semantic questions, all picked by the semantic report and none by the SQL one', () => {
    const semanticEntries = requireRelevanceScored(selectEntries(entries, SEMANTIC_SELECTION));
    expect(semanticEntries).toHaveLength(10);
    expect(semanticEntries.every((question) => question.milestone === 'M2')).toBe(true);
    expect(sqlEntries.some((question) => question.milestone === 'M2')).toBe(false);
  });

  it('gives every entry an expected route for the router report', () => {
    expect(entries.filter((question) => question.route === undefined)).toEqual([]);
  });

  it('has at least two questions the data cannot answer', () => {
    expect(
      sqlEntries.filter((question) => question.expected.kind === 'decline').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it.each(
    [
      'price range',
      'bedrooms',
      'bathrooms',
      'postcode district',
      'boolean flag',
      'disclosures join',
      'disclosures left join',
      'ordering',
      'aggregate',
    ].map((category) => [category]),
  )('covers %s in the SQL report', (category) => {
    expect(sqlEntries.some((question) => question.category.includes(category))).toBe(true);
  });

  it.each(
    sqlEntries.flatMap((question) =>
      question.expected.kind === 'decline'
        ? []
        : [{ id: question.id, reference: question.expected.reference }],
    ),
  )('has a reference the validator accepts: $id', ({ reference }) => {
    expect(new SqlValidator(ROW_LIMIT).validate(reference)).toMatchObject({ ok: true });
  });
});

describe('parseGoldenSet', () => {
  it('accepts each kind of expected outcome', () => {
    const parsed = parseGoldenSet([
      entry(),
      entry({
        id: 'five-cheapest-3-bed-ellon',
        category: 'ordering',
        expected: {
          kind: 'rows',
          reference: 'SELECT p.price FROM properties p ORDER BY p.price LIMIT 5',
          ordered: true,
        },
      }),
      entry({ id: 'decline-epc-rating', slice: 'unanswerable', expected: { kind: 'decline' } }),
      entry({ id: 'cosy-flat-garden', slice: 'semantic', milestone: 'M2', expected: LABELLED }),
    ]);
    expect(parsed.map((question) => question.expected.kind)).toEqual([
      'aggregate',
      'rows',
      'decline',
      'relevant_ids',
    ]);
  });

  it('reads an expected route with its acceptable intents and filters', () => {
    const route = { intents: ['structured'], filters: { towns: ['Stonehaven'] } };

    expect(parseGoldenSet([entry({ route })])[0].route).toEqual(route);
  });

  it('names the entry that fails the schema', () => {
    expect(() => parseGoldenSet([entry(), entry({ id: 'bad-slice', slice: 'vibes' })])).toThrow(
      /entry "bad-slice" is invalid: .*slice/,
    );
  });

  it('names the position when the entry has no usable id', () => {
    expect(() => parseGoldenSet([entry(), entry({ id: undefined })])).toThrow(
      /entry at position 2 is invalid/,
    );
  });

  it.each([
    ['an unknown field', { notes: 'free text' }],
    ['a milestone that is not M plus a number', { milestone: 'M-two' }],
    ['an id that is not kebab case', { id: 'Count Stonehaven' }],
    ['a reference query that is empty', { expected: { kind: 'rows', reference: '' } }],
    ['relevant ids with no label', { expected: { kind: 'relevant_ids', ids: [PROPERTY_ID] } }],
    ['relevant ids with no ids', { expected: { ...LABELLED, ids: [] } }],
    ['relevant ids labelled on no real date', { expected: { ...LABELLED, labelledOn: 'Monday' } }],
    ['an empty uncertain list', { expected: { ...LABELLED, uncertainIds: [] } }],
    [
      'an id both relevant and uncertain',
      { expected: { ...LABELLED, uncertainIds: [PROPERTY_ID] } },
    ],
    ['a route with no intents', { route: { intents: [] } }],
    ['a route with an unknown intent', { route: { intents: ['chitchat'] } }],
    ['a route with an unknown field', { route: { intents: ['structured'], notes: 'x' } }],
  ])('rejects %s', (_, overrides) => {
    expect(() => parseGoldenSet([entry(overrides)])).toThrow(/is invalid/);
  });

  it('rejects a repeated id and names it', () => {
    expect(() => parseGoldenSet([entry(), entry()])).toThrow(
      'golden set entry "count-stonehaven" is repeated',
    );
  });
});

describe('uncertain ids', () => {
  it('are kept beside the relevant ids', () => {
    const [parsed] = parseGoldenSet([
      entry({
        id: 'cosy-flat-garden',
        slice: 'semantic',
        milestone: 'M2',
        expected: { ...LABELLED, uncertainIds: [UNCERTAIN_PROPERTY_ID] },
      }),
    ]);
    expect(parsed.expected).toMatchObject({ uncertainIds: [UNCERTAIN_PROPERTY_ID] });
  });
});

describe('selectEntries', () => {
  const entries: GoldenEntry[] = parseGoldenSet([
    entry({ id: 'm1-structured', slice: 'structured_filters' }),
    entry({ id: 'm2-semantic', slice: 'semantic', milestone: 'M2', expected: LABELLED }),
    entry({ id: 'm1-refusal', slice: 'unanswerable', expected: { kind: 'decline' } }),
    entry({ id: 'm2-structured', slice: 'structured_filters', milestone: 'M2' }),
  ]);

  it('picks an entry only when both its slice and its milestone are listed, in file order', () => {
    const picked = selectEntries(entries, {
      slices: [GOLDEN_SLICE.STRUCTURED_FILTERS, GOLDEN_SLICE.UNANSWERABLE],
      milestones: ['M1'],
    });
    expect(picked.map((question) => question.id)).toEqual(['m1-structured', 'm1-refusal']);
  });

  it('picks by slice across milestones', () => {
    const picked = selectEntries(entries, {
      slices: [GOLDEN_SLICE.STRUCTURED_FILTERS],
      milestones: ['M1', 'M2'],
    });
    expect(picked.map((question) => question.id)).toEqual(['m1-structured', 'm2-structured']);
  });

  it('picks by milestone across slices', () => {
    const picked = selectEntries(entries, {
      slices: Object.values(GOLDEN_SLICE),
      milestones: ['M2'],
    });
    expect(picked.map((question) => question.id)).toEqual(['m2-semantic', 'm2-structured']);
  });
});

describe('requireSqlScored', () => {
  it('passes entries with a reference query or a refusal', () => {
    const entries = parseGoldenSet([
      entry(),
      entry({ id: 'm1-refusal', expected: { kind: 'decline' } }),
    ]);
    expect(requireSqlScored(entries)).toEqual(entries);
  });

  it('refuses an entry labelled with relevant ids and names it', () => {
    const entries = parseGoldenSet([
      entry(),
      entry({ id: 'cosy-flat-garden', slice: 'semantic', expected: LABELLED }),
    ]);
    expect(() => requireSqlScored(entries)).toThrow(
      'golden set entry "cosy-flat-garden" is labelled with relevant ids, which the SQL runner cannot score',
    );
  });
});

describe('requireRelevanceScored', () => {
  it('passes entries labelled with relevant ids', () => {
    const entries = parseGoldenSet([
      entry({ id: 'cosy-flat-garden', slice: 'semantic', milestone: 'M2', expected: LABELLED }),
    ]);
    expect(requireRelevanceScored(entries)).toEqual(entries);
  });

  it('refuses an entry with a reference query and names it', () => {
    const entries = parseGoldenSet([entry()]);
    expect(() => requireRelevanceScored(entries)).toThrow(
      'golden set entry "count-stonehaven" has no relevant ids, so a retrieval runner cannot score it',
    );
  });
});
