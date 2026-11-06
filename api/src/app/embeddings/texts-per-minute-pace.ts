import { setTimeout as sleep } from 'node:timers/promises';

const MINUTE_MS = 60_000;

interface Sent {
  readonly at: number;
  readonly texts: number;
}

/**
 * Keeps the texts sent to the embedding model under a per minute limit. Some
 * vendors count every text in a batch as one request (Gemini's free tier
 * allows 100 a minute), so pacing by texts rather than by calls is what stays
 * under the limit. Before a batch goes out, `reserve` waits until the texts
 * sent in the last minute plus this batch fit, then records the batch.
 */
export class TextsPerMinutePace {
  private sent: Sent[] = [];

  public constructor(
    private readonly limit: number,
    // Injected so tests can run the clock rather than wait for it.
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<unknown> = (ms) => sleep(ms),
  ) {}

  /** Waits until `texts` more can be sent inside the limit, then counts them as sent. */
  public async reserve(texts: number): Promise<void> {
    if (texts > this.limit) {
      throw new Error(
        `A batch of ${String(texts)} texts can never fit a limit of ${String(this.limit)} a minute. Lower EMBED_BATCH_SIZE or raise EMBED_TEXTS_PER_MINUTE.`,
      );
    }
    for (;;) {
      const now = this.now();
      this.sent = this.sent.filter((batch) => now - batch.at < MINUTE_MS);
      const used = this.sent.reduce((sum, batch) => sum + batch.texts, 0);
      if (used + texts <= this.limit) {
        this.sent.push({ at: now, texts });
        return;
      }
      // The oldest batch leaving the window is the soonest anything frees up.
      await this.wait(this.sent[0].at + MINUTE_MS - now);
    }
  }
}
