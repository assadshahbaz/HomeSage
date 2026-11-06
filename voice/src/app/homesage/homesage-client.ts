import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AppConfig } from '../../infra/config/app-config.js';
import { APP_CONFIG } from '../../infra/config/app-config.symbol.js';
import { homesageChatEventSchema } from './chat-events.js';
import type { HomesageProperty } from './chat-events.js';
import { readSseFrames } from './sse-frames.js';

const HTTP_TOO_MANY_REQUESTS = 429;
const HEALTH_TIMEOUT_MS = 2_000;

/** What HomeSage said, and the listings its answer cited, in order of first citation. */
export interface HomesageAnswer {
  readonly text: string;
  readonly citedProperties: readonly HomesageProperty[];
}

/** Why HomeSage could not answer. The message is for logs, never for the caller. */
export class HomesageUnavailableError extends Error {
  public constructor(
    message: string,
    public readonly reason: 'busy' | 'failed',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'HomesageUnavailableError';
  }
}

/**
 * Asks HomeSage's `POST /chat` a question and reads its event stream to the
 * end: the answer text from the tokens, and the cited listings by matching
 * the citation ids against the listings retrieval returned.
 */
@Injectable()
export class HomesageClient {
  private readonly logger = new Logger(HomesageClient.name);

  public constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Answers `question`, or throws `HomesageUnavailableError`. */
  public async ask(
    question: string,
    sessionId: string,
    requestId: string,
  ): Promise<HomesageAnswer> {
    let response: Response;
    try {
      response = await fetch(`${this.config.homesage.url}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'X-Request-Id': requestId,
        },
        body: JSON.stringify({ question, sessionId }),
        signal: AbortSignal.timeout(this.config.homesage.timeoutMs),
      });
    } catch (error) {
      throw new HomesageUnavailableError('HomeSage could not be reached', 'failed', {
        cause: error,
      });
    }

    if (response.status === HTTP_TOO_MANY_REQUESTS) {
      throw new HomesageUnavailableError('HomeSage rate limited the request', 'busy');
    }
    if (!response.ok || response.body === null) {
      throw new HomesageUnavailableError(`HomeSage answered ${response.status}`, 'failed');
    }

    try {
      return await this.readAnswer(response.body);
    } catch (error) {
      if (error instanceof HomesageUnavailableError) {
        throw error;
      }
      throw new HomesageUnavailableError('HomeSage stream failed', 'failed', { cause: error });
    }
  }

  /** True when HomeSage's own health check answers 200 within two seconds. */
  public async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.homesage.url}/health`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async readAnswer(body: ReadableStream<Uint8Array>): Promise<HomesageAnswer> {
    let text = '';
    let retrieved: readonly HomesageProperty[] = [];
    let citedIds: readonly string[] = [];
    let finished = false;

    for await (const frame of readSseFrames(body)) {
      const parsed = homesageChatEventSchema.safeParse(safeJson(frame.data));
      if (!parsed.success) {
        // A newer HomeSage may send events this service does not know; they carry nothing it needs.
        this.logger.warn(`Skipped an unreadable HomeSage event: ${frame.event}`);
        continue;
      }
      const event = parsed.data;
      switch (event.type) {
        case 'retrieval':
          retrieved = event.properties ?? [];
          break;
        case 'token':
          text += event.text;
          break;
        case 'citations':
          citedIds = event.ids ?? [];
          break;
        case 'error':
          throw new HomesageUnavailableError(`HomeSage stream error: ${event.message}`, 'failed');
        case 'done':
          finished = true;
          break;
        case 'route':
          break;
      }
    }

    if (!finished) {
      throw new HomesageUnavailableError('HomeSage stream ended without done', 'failed');
    }
    const byId = new Map(retrieved.map((property) => [property.id, property]));
    const citedProperties = citedIds
      .map((id) => byId.get(id))
      .filter((property) => property !== undefined);
    return { text, citedProperties };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
