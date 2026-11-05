import { parseArgs } from 'node:util';
import { z } from 'zod';
import { INGESTION_MODE } from './ingestion-mode.js';
import type { IngestionOptions } from './ingestion-mode.js';

export const INGEST_USAGE =
  'Usage: npm run ingest -- --full [--restart]\n       npm run ingest -- --since <ISO timestamp with a zone, such as 2026-09-27T10:00:00Z>';

// An explicit zone is required: a bare local time means a different instant on
// every machine, which is the mistake an incremental sync cannot afford.
const sinceSchema = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

/**
 * Turns the `ingest` command line into run options: exactly one of `--full`,
 * with `--restart` allowed beside it, or `--since` with a timestamp. Throws the
 * usage, with what was wrong, on anything else.
 */
export function parseIngestArguments(args: readonly string[]): IngestionOptions {
  const { values } = parseArgs({
    args: [...args],
    options: {
      full: { type: 'boolean', default: false },
      restart: { type: 'boolean', default: false },
      since: { type: 'string' },
    },
    strict: true,
  });

  if (values.full === (values.since !== undefined)) {
    throw usageError('Pass exactly one of --full or --since.');
  }
  if (values.since === undefined) {
    return { mode: INGESTION_MODE.FULL, restart: values.restart };
  }
  if (values.restart) {
    throw usageError('--restart goes with --full only; an incremental sync has no checkpoint.');
  }
  const since = sinceSchema.safeParse(values.since);
  if (!since.success) {
    throw usageError(`--since ${values.since} is not an ISO timestamp with a zone.`);
  }
  return { mode: INGESTION_MODE.SINCE, since: since.data };
}

function usageError(problem: string): Error {
  return new Error(`${problem}\n${INGEST_USAGE}`);
}
