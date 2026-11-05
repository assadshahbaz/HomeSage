import { randomUUID } from 'node:crypto';
import { isString } from '../../contracts/index.js';

/** Header the id travels on, in the lower case form Express stores it under. */
export const REQUEST_ID_HEADER = 'x-request-id';

const MAX_LENGTH = 64;
const SAFE_CHARACTERS = /^[A-Za-z0-9_-]+$/;

/**
 * Keeps the caller's id when it is safe to put in a log line, and makes a fresh
 * one otherwise. Logs are text, so a crafted id could forge a line.
 */
export function toRequestId(inbound: unknown): string {
  if (
    isString(inbound) &&
    inbound.length > 0 &&
    inbound.length <= MAX_LENGTH &&
    SAFE_CHARACTERS.test(inbound)
  ) {
    return inbound;
  }

  return randomUUID();
}
