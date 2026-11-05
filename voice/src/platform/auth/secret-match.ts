import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Compares a presented secret with the expected one in constant time. Both are
 * hashed first, so their lengths never leak through an early return.
 */
export function secretMatches(presented: string | undefined, expected: string): boolean {
  if (presented === undefined || presented === '') {
    return false;
  }
  const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

/** The token from an `Authorization: Bearer <token>` header, or undefined. */
export function bearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  return match?.[1]?.trim();
}
