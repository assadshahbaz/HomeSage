/** Why the client could not read an answer, as opposed to the API's own `error` event. */
export const CHAT_STREAM_FAILURE_REASON = {
  /** A 400. A valid client should never cause one. */
  REJECTED: 'rejected',
  /** A 429. */
  RATE_LIMITED: 'rate_limited',
  /** A 503 or any other status that is not a success. */
  UNAVAILABLE: 'unavailable',
  /** The request failed or the body could not be read. */
  NETWORK: 'network',
  /** A frame that is not a valid event, a body that is not SSE, or an oversized frame. */
  MALFORMED: 'malformed',
  /** The body closed without `done` or `error`. */
  ENDED_EARLY: 'ended_early',
} as const;

export type ChatStreamFailureReason =
  (typeof CHAT_STREAM_FAILURE_REASON)[keyof typeof CHAT_STREAM_FAILURE_REASON];

const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;

// The client's own words: a server error body is written for developers.
const FAILURE_MESSAGES: Record<ChatStreamFailureReason, string> = {
  rejected: 'That question could not be sent. Please rephrase it and try again.',
  rate_limited: 'Too many questions in a short time. Please wait a moment and try again.',
  unavailable: 'HomeSage is unavailable right now. Please try again shortly.',
  network: 'The connection was lost. Please check your connection and ask again.',
  malformed: 'The answer could not be read. Please ask again.',
  ended_early: 'The answer stopped before it finished. Please ask again.',
};

/** A failure to show the user. `message` is always safe to display. */
export type ChatStreamFailure =
  | {
      readonly reason: typeof CHAT_STREAM_FAILURE_REASON.RATE_LIMITED;
      readonly message: string;
      /** From `Retry-After`, or null when the header is missing or not a number of seconds. */
      readonly retryAfterSeconds: number | null;
    }
  | {
      readonly reason: Exclude<
        ChatStreamFailureReason,
        typeof CHAT_STREAM_FAILURE_REASON.RATE_LIMITED
      >;
      readonly message: string;
    };

/** A failure for any reason but rate limiting, with its message. */
export function chatStreamFailure(
  reason: Exclude<ChatStreamFailureReason, typeof CHAT_STREAM_FAILURE_REASON.RATE_LIMITED>,
): ChatStreamFailure {
  return { reason, message: FAILURE_MESSAGES[reason] };
}

/** The failure for a response that is not a success, read from its status and headers only. */
export function failureForResponse(response: Response): ChatStreamFailure {
  switch (response.status) {
    case HTTP_BAD_REQUEST:
      return chatStreamFailure(CHAT_STREAM_FAILURE_REASON.REJECTED);
    case HTTP_TOO_MANY_REQUESTS:
      return {
        reason: CHAT_STREAM_FAILURE_REASON.RATE_LIMITED,
        message: FAILURE_MESSAGES.rate_limited,
        retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
      };
    default:
      return chatStreamFailure(CHAT_STREAM_FAILURE_REASON.UNAVAILABLE);
  }
}

// The API sends whole seconds; the HTTP date form is not used, so it reads as unknown.
function parseRetryAfter(header: string | null): number | null {
  return header !== null && /^\d+$/.test(header.trim()) ? Number(header.trim()) : null;
}
