/** One call for vectors: the model, the texts in order, and the size each vector must be. */
export interface EmbeddingRequest {
  readonly model: string;
  readonly texts: readonly string[];
  readonly dimensions: number;
  /** Ends the call when it fires. The caller owns the deadline and any retries. */
  readonly signal: AbortSignal;
}

/** The vectors that came back, in the order of the texts, and the tokens they were billed on. */
export interface EmbeddingResponse {
  readonly vectors: readonly (readonly number[])[];
  readonly inputTokens: number;
}

/**
 * An embedding vendor behind two methods, so a vendor that embeds a stored
 * document and a search query differently can do both. Features never see it:
 * they call `EmbeddingService`, which batches, retries and logs the cost.
 */
export interface EmbeddingProvider {
  /** Vectors for property documents that will be stored and searched. */
  embedDocuments(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  /** Vectors for search queries, compared against the stored documents. */
  embedQueries(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  /**
   * Whether a failed call is worth trying again, and how soon. Null when it is
   * not: a bad request or a rejected key. Otherwise the least time the vendor
   * asked to wait, in milliseconds, or 0 when it named none. Rate limits,
   * overloaded servers and dropped connections are worth another try, and each
   * vendor reports them its own way.
   */
  retryAfterMs(error: unknown): number | null;
}
