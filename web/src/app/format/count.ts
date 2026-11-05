/** The singular and plural of the thing being counted. */
export interface CountUnit {
  one: string;
  many: string;
}

/**
 * A count with its unit, "1 bedroom" or "3 bedrooms". A null count means the
 * listing did not give one, so it writes nothing rather than "0 bedrooms".
 */
export function formatCount(count: number | null, unit: CountUnit): string | null {
  if (count === null) {
    return null;
  }
  return `${count} ${count === 1 ? unit.one : unit.many}`;
}
