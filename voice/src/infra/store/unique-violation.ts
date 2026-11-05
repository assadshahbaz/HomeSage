// SQLITE_CONSTRAINT_UNIQUE, the extended result code for a duplicate key.
const SQLITE_CONSTRAINT_UNIQUE = 2067;

/** True when `error` is SQLite refusing a row that breaks a unique index. */
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as Error & { errcode?: unknown }).errcode;
  return code === SQLITE_CONSTRAINT_UNIQUE || error.message.includes('UNIQUE constraint failed');
}
