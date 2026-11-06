import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AppConfig } from '../../infra/config/app-config.js';
import { APP_CONFIG } from '../../infra/config/app-config.symbol.js';

/** Something the office should hear about straight away. */
export interface Notice {
  readonly kind: 'viewing_booked' | 'valuation_requested' | 'message_taken';
  /** One readable line, which is all a Slack incoming webhook shows. */
  readonly text: string;
  readonly details: Readonly<Record<string, string | boolean | null>>;
}

/**
 * Tells the office about a new lead by posting JSON to the configured webhook:
 * `text` for Slack, `kind` and `details` for Make, n8n or Zapier. Without a
 * webhook it does nothing beyond the record already stored. A failed post is
 * logged and never reaches the caller, whose booking is already saved.
 */
@Injectable()
export class Notifier {
  private readonly logger = new Logger(Notifier.name);

  public constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Posts the notice, and resolves either way. */
  public async send(notice: Notice): Promise<void> {
    const { webhookUrl, timeoutMs } = this.config.notify;
    if (webhookUrl === null) {
      return;
    }
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notice),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        this.logger.warn(`Notify webhook answered ${response.status} for ${notice.kind}`);
      }
    } catch (error) {
      this.logger.warn(
        `Notify webhook failed for ${notice.kind}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
