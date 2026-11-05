import { z } from 'zod';
import { readJson } from './eval-data.ts';
import { routeExpectationSchema } from './route-expectation.ts';

/** The kinds of question the golden set measures, so each report can pick its own. */
export const GOLDEN_SLICE = {
  STRUCTURED_FILTERS: 'structured_filters',
  AGGREGATES_AND_ORDERING: 'aggregates_and_ordering',
  SEMANTIC: 'semantic',
  HYBRID: 'hybrid',
  UNANSWERABLE: 'unanswerable',
  OUT_OF_SCOPE: 'out_of_scope',
  FOLLOW_UPS: 'follow_ups',
  ZERO_MATCHES: 'zero_matches',
} as const;

export type GoldenSlice = (typeof GOLDEN_SLICE)[keyof typeof GOLDEN_SLICE];

const sliceSchema = z.enum(Object.values(GOLDEN_SLICE) as [GoldenSlice, ...GoldenSlice[]]);

const expectedSchema = z.discriminatedUnion('kind', [
  // The reference query's rows are the right answer.
  z.object({
    kind: z.literal('rows'),
    reference: z.string().min(1),
    // The question asks for an order, so rows must come back in the reference's order.
    ordered: z.boolean().optional(),
  }),
  // The reference query computes the right values: a count, an average, a grouped total.
  z.object({ kind: z.literal('aggregate'), reference: z.string().min(1) }),
  // The data cannot answer the question, so the right result is a refusal.
  z.object({ kind: z.literal('decline') }),
  // Labelled from a pool of candidates, so who or what labelled it and when is part of the answer.
  z
    .object({
      kind: z.literal('relevant_ids'),
      ids: z.array(z.number().int().positive()).min(1),
      // The record points to a match but cannot prove it, so scoring counts these neither way.
      uncertainIds: z.array(z.number().int().positive()).min(1).optional(),
      labelledBy: z.string().min(1),
      labelledOn: z.iso.date(),
    })
    .refine((expected) => !(expected.uncertainIds ?? []).some((id) => expected.ids.includes(id)), {
      message: 'an id cannot be both relevant and uncertain',
      path: ['uncertainIds'],
    }),
]);

const goldenEntrySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  slice: sliceSchema,
  // The milestone that added the entry, such as M1 or M2.1.
  milestone: z.string().regex(/^M\d+(\.\d+)?$/),
  category: z.string().min(1),
  question: z.string().min(1),
  expected: expectedSchema,
  // How the router should read the question, scored by the router report.
  route: routeExpectationSchema.optional(),
});

export type GoldenEntry = z.infer<typeof goldenEntrySchema>;
export type GoldenExpected = GoldenEntry['expected'];

/** An entry the text to SQL path can be scored on: a reference query or a refusal. */
export type SqlScoredEntry = GoldenEntry & {
  readonly expected: Exclude<GoldenExpected, { kind: 'relevant_ids' }>;
};

/** An entry the retrieval runners score by recall: hand labelled relevant ids. */
export type RelevanceScoredEntry = GoldenEntry & {
  readonly expected: Extract<GoldenExpected, { kind: 'relevant_ids' }>;
};

/** Which entries a report runs. An entry is picked when both its slice and its milestone are listed. */
export interface GoldenSelection {
  readonly slices: readonly GoldenSlice[];
  readonly milestones: readonly string[];
}

/**
 * Parses the golden set one entry at a time, so a bad entry stops the run with
 * its id (or its position, when the id itself is missing) and the reason.
 */
export function parseGoldenSet(raw: unknown): GoldenEntry[] {
  const entries = z.array(z.unknown()).parse(raw);
  const parsed = entries.map((entry, index) => {
    const result = goldenEntrySchema.safeParse(entry);
    if (!result.success) {
      const id = z.object({ id: z.string() }).safeParse(entry);
      const name = id.success ? `"${id.data.id}"` : `at position ${String(index + 1)}`;
      throw new Error(
        `golden set entry ${name} is invalid: ${z.prettifyError(result.error).replace(/\n/g, ' ')}`,
      );
    }
    return result.data;
  });
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (seen.has(entry.id)) {
      throw new Error(`golden set entry "${entry.id}" is repeated`);
    }
    seen.add(entry.id);
  }
  return parsed;
}

/** The one golden set every milestone grows, checked for shape and unique ids. */
export function loadGoldenSet(): GoldenEntry[] {
  return parseGoldenSet(readJson('workbench/evals/golden-set.json'));
}

/** The entries whose slice and milestone are both in the selection, in file order. */
export function selectEntries(
  entries: readonly GoldenEntry[],
  selection: GoldenSelection,
): GoldenEntry[] {
  return entries.filter(
    (entry) =>
      selection.slices.includes(entry.slice) && selection.milestones.includes(entry.milestone),
  );
}

/**
 * The entries as the SQL runner scores them. An entry labelled with relevant
 * ids has no reference query to compare rows against, so selecting one is a
 * mistake in the selection, not something to skip quietly.
 */
export function requireSqlScored(entries: readonly GoldenEntry[]): SqlScoredEntry[] {
  return entries.map((entry) => {
    if (entry.expected.kind === 'relevant_ids') {
      throw new Error(
        `golden set entry "${entry.id}" is labelled with relevant ids, which the SQL runner cannot score`,
      );
    }
    return { ...entry, expected: entry.expected };
  });
}

/**
 * The entries as a retrieval runner scores them. An entry with a reference
 * query or a refusal has no labelled ids to find, so selecting one is a
 * mistake in the selection.
 */
export function requireRelevanceScored(entries: readonly GoldenEntry[]): RelevanceScoredEntry[] {
  return entries.map((entry) => {
    if (entry.expected.kind !== 'relevant_ids') {
      throw new Error(
        `golden set entry "${entry.id}" has no relevant ids, so a retrieval runner cannot score it`,
      );
    }
    return { ...entry, expected: entry.expected };
  });
}
