import { cleanText } from './source-text.ts';

/** Thrown when a value cannot be trusted, so the run stops instead of guessing. */
export class ImportDataError extends Error {
  public constructor(field: string, value: unknown, propertyId: number | string) {
    super(`Property ${propertyId}: unexpected value for ${field}: ${JSON.stringify(value)}`);
    this.name = 'ImportDataError';
  }
}

/**
 * Required whole number. Throws rather than importing a hole in the data.
 * Accepts the scientific notation a handful of prices above a million use in
 * some sources (`1.2e+006`), as long as the value is still a whole number.
 */
export function requireInt(
  value: string | null,
  field: string,
  propertyId: number | string,
): number {
  const text = cleanText(value);
  if (text === '' || !/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(text)) {
    throw new ImportDataError(field, value, propertyId);
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new ImportDataError(field, value, propertyId);
  }
  return parsed;
}

/** Whole number where the raw row uses 0 for "not known", so 0 becomes null. */
export function optionalCount(
  value: string | null,
  field: string,
  propertyId: number | string,
): number | null {
  const parsed = requireInt(value, field, propertyId);
  return parsed === 0 ? null : parsed;
}
