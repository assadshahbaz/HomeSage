/**
 * Narrowing for values already in hand. Anything crossing into the process is
 * parsed with a Zod schema at the boundary instead.
 */

/** Narrows to `string`, empty ones included. */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** Narrows to a keyed object, ruling out `null` and arrays. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
