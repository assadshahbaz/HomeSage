import type { CallContext } from './agent-tool.js';

/**
 * The number to call the caller back on: the one they gave, else caller ID,
 * else null. Spaces, dashes and brackets are dropped, and a leading plus kept.
 */
export function callerPhone(given: string | undefined, call: CallContext): string | null {
  const raw = given ?? call.callerNumber;
  if (raw === null) {
    return null;
  }
  const digits = raw.replace(/[^\d+]/g, '');
  const normalised = digits.startsWith('+')
    ? `+${digits.slice(1).replace(/\+/g, '')}`
    : digits.replace(/\+/g, '');
  return normalised === '' || normalised === '+' ? null : normalised;
}

/** The refusal when there is no number, which the model fixes by asking for one. */
export const NO_PHONE_REASON =
  'there is no phone number for this caller. Ask for a number to call them back on, read it back, then try again with callerPhone.';
