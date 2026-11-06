// Long enough for a vendor's own explanation, short enough to read in a list.
const MAX_REASON_LENGTH = 300;
// Vendors often put their error body in the message as JSON; its "message" is the useful part.
const JSON_MESSAGE = /"message":\s*"((?:[^"\\]|\\.)*)"/;

/**
 * Why a document was lost, as one readable line: the vendor's own message when
 * the error carries its JSON body, with whitespace collapsed and the length capped.
 * An error that wraps another, such as a timeout around the rate limit that
 * caused it, names both, since the wrapped one says what actually went wrong.
 */
export function deadLetterReason(error: unknown): string {
  const line = describe(error);
  return line.length > MAX_REASON_LENGTH ? `${line.slice(0, MAX_REASON_LENGTH - 1)}…` : line;
}

function describe(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const quoted = JSON_MESSAGE.exec(text)?.[1];
  // A quoted message still carries its JSON escapes, so a newline is written \n there.
  const message = quoted === undefined ? text : quoted.replace(/\\n/g, ' ').replace(/\\"/g, '"');
  const line = message.replace(/\s+/g, ' ').trim();
  return error instanceof Error && error.cause !== undefined
    ? `${line}, after: ${describe(error.cause)}`
    : line;
}
