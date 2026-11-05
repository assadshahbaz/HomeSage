let lastId = 0;

/** Returns an id unique on the page, for linking a label, hint or heading to its element. */
export function uniqueId(prefix: string): string {
  lastId += 1;
  return `hs-${prefix}-${lastId}`;
}
