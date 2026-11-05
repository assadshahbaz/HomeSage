/** One call to a model: fixed instructions and a user turn carrying the data. */
export interface LlmRequest {
  readonly model: string;
  readonly system: string;
  readonly user: string;
  readonly maxTokens: number;
  /** How long the call may take, every retry included, before it fails as a timeout. */
  readonly timeoutMs: number;
  /** Sampling temperature, or null to leave the provider's default. */
  readonly temperature: number | null;
}

/** What came back, with the token counts the call is billed on. */
export interface LlmCompletion {
  readonly text: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly stopReason: string | null;
}

/**
 * One step of a streamed reply: a piece of text as it arrives, then exactly
 * one end event, last, carrying the whole reply and its token counts.
 */
export type LlmStreamEvent =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'end'; readonly completion: LlmCompletion };

/**
 * A model vendor behind two methods. Features never see it: they call
 * `LlmService`, which picks the model, logs the cost and delegates here.
 */
export interface LlmProvider {
  complete(request: LlmRequest): Promise<LlmCompletion>;
  /** The same call, streamed. The request's timeout covers the whole stream. */
  stream(request: LlmRequest): AsyncIterable<LlmStreamEvent>;
}
