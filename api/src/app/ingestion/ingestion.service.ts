import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmbeddingsConfig } from '../../infra/config/embeddings.config.js';
import { AppLogger } from '../../platform/logging/app-logger.js';
import { EmbeddingService } from '../embeddings/embedding.service.js';
import type { EmbeddedTexts, EmbeddingUsage } from '../embeddings/embedding.service.js';
import { PropertyDocumentBuilder } from './document/property-document-builder.js';
import type { PropertyDocument } from './document/property-document.js';
import { INGESTION_MODE } from './ingestion-mode.js';
import type { IngestionMode, IngestionOptions } from './ingestion-mode.js';
import { deadLetterReason } from './run-state/dead-letter-reason.js';
import { INGESTION_STAGE, IngestionRunState } from './run-state/ingestion-run-state.js';
import type { DeadLetter } from './run-state/ingestion-run-state.js';
import { PropertyIndex } from './search-index/property-index.js';
import { PropertyReader } from './source/property-reader.js';

// Enough precision for a fraction of a cent, as the embedding logs use.
const COST_DECIMALS = 6;

/** What a run did, for the end of run summary and the eval report. */
export interface IngestionSummary {
  readonly mode: IngestionMode;
  /** The bound an incremental run read from, or null for a full run. */
  readonly since: Date | null;
  /** The property id a full run continued after, or null when it started from the beginning. */
  readonly resumedAfterId: number | null;
  /**
   * What to pass as `--since` next time: the database clock just before this
   * run, or the full run it resumed, began reading. A row changed while the run
   * was reading is at or after it, so the next sync picks it up. Null only when
   * resuming a full run that recorded no bound.
   */
  readonly nextSince: Date | null;
  /** Rows this run read from MySQL. */
  readonly read: number;
  /** Documents this run wrote to the index. */
  readonly written: number;
  /** Documents this run had to leave out; each is in the dead letter log. */
  readonly failed: number;
  /** Documents in the index when the run finished. */
  readonly indexed: number;
  readonly durationMs: number;
  readonly embedding: EmbeddingUsage;
  /** Every dead letter since the run began, including any full run this one resumed. */
  readonly deadLetters: readonly DeadLetter[];
}

/** Where a run starts reading and what it reports for the next sync. */
interface RunStart {
  readonly afterId: number;
  readonly since: Date | null;
  readonly resumedAfterId: number | null;
  readonly nextSince: Date | null;
}

/**
 * Reads properties from MySQL, builds each document, embeds it and upserts it
 * into Elasticsearch, a page at a time. A full run reads every property; an
 * incremental one only those whose `updated_at` is at or after its bound, down
 * the same path. Documents are keyed by property id, so a rerun replaces rather
 * than duplicates.
 *
 * A full run checkpoints the last id of each page it writes outside the
 * process, so a run that stops part way continues from there. An incremental
 * run leaves that checkpoint alone: it is cheap and idempotent, so running it
 * again with the same bound is its resume. A document that fails is recorded
 * as a dead letter and the run carries on; a failure of the whole index, such
 * as Elasticsearch being down, stops the run.
 */
@Injectable()
export class IngestionService {
  private readonly builder = new PropertyDocumentBuilder();
  private readonly pageSize: number;

  public constructor(
    private readonly reader: PropertyReader,
    private readonly embeddings: EmbeddingService,
    private readonly index: PropertyIndex,
    private readonly state: IngestionRunState,
    private readonly logger: AppLogger,
    configService: ConfigService,
  ) {
    // One page is one embedding batch.
    this.pageSize = configService.getOrThrow<EmbeddingsConfig>('embeddings').batchSize;
  }

  /** Runs a full ingestion, resuming a stopped one unless `restart` is set, or an incremental one. */
  public async run(options: IngestionOptions): Promise<IngestionSummary> {
    const startedAt = Date.now();
    await this.index.ensure();

    const full = options.mode === INGESTION_MODE.FULL;
    const start = full
      ? await this.startFull(options.restart)
      : await this.startSince(options.since);

    let afterId = start.afterId;
    let read = 0;
    let written = 0;
    let failed = 0;
    let usage: EmbeddingUsage = { calls: 0, inputTokens: 0, costUsd: 0 };

    for (;;) {
      const page = await this.reader.readPage(afterId, this.pageSize, start.since);
      if (page.lastId === null) {
        break;
      }
      read += page.properties.length + page.unreadable.length;

      const letters: DeadLetter[] = page.unreadable.map((row) => ({
        id: row.id,
        stage: INGESTION_STAGE.READ,
        reason: row.reason,
      }));
      const documents = page.properties.map(({ property, disclosure }) =>
        this.builder.build(property, disclosure),
      );

      const outcome = await this.embedAndWrite(documents);
      letters.push(...outcome.letters);
      usage = addUsage(usage, outcome.usage);
      written += outcome.written;
      failed += letters.length;

      await this.state.recordDeadLetters(options.mode, letters);
      if (full) {
        await this.state.saveCheckpoint(page.lastId);
      }
      afterId = page.lastId;
      this.logger.log(
        `ingested up to property ${String(page.lastId)}`,
        { mode: options.mode, lastId: page.lastId, read, written, failed },
        IngestionService.name,
      );
    }

    await this.index.refresh();
    const indexed = await this.index.count();
    const deadLetters = await this.state.deadLetters(options.mode);
    if (full) {
      // Finished, so the next full run starts from the beginning rather than from here.
      await this.state.clearCheckpoint();
    }

    return {
      mode: options.mode,
      since: start.since,
      resumedAfterId: start.resumedAfterId,
      nextSince: start.nextSince,
      read,
      written,
      failed,
      indexed,
      durationMs: Date.now() - startedAt,
      embedding: usage,
      deadLetters,
    };
  }

  /**
   * Resumes after the checkpoint when there is one, with the bound the stopped
   * run recorded. Otherwise starts from the first property, taking and keeping
   * the bound before anything is read.
   */
  private async startFull(restart: boolean): Promise<RunStart> {
    if (restart) {
      await this.state.clearCheckpoint();
    }
    const resumedAfterId = await this.state.checkpoint();
    if (resumedAfterId !== null) {
      return {
        afterId: resumedAfterId,
        since: null,
        resumedAfterId,
        nextSince: await this.state.fullRunBound(),
      };
    }
    await this.state.clearDeadLetters(INGESTION_MODE.FULL);
    const nextSince = await this.reader.now();
    await this.state.saveFullRunBound(nextSince);
    return { afterId: 0, since: null, resumedAfterId: null, nextSince };
  }

  /** Starts a sync from the first changed property, with its own dead letters and no checkpoint. */
  private async startSince(since: Date): Promise<RunStart> {
    await this.state.clearDeadLetters(INGESTION_MODE.SINCE);
    return { afterId: 0, since, resumedAfterId: null, nextSince: await this.reader.now() };
  }

  /**
   * Embeds one page and writes it. An embedding failure, after the service's
   * own retries, loses the page's documents to the dead letters rather than
   * the run. A failed write of the whole page is not caught: it means the
   * index itself is unavailable, and the checkpoint keeps the run resumable.
   */
  private async embedAndWrite(documents: readonly PropertyDocument[]): Promise<{
    written: number;
    letters: DeadLetter[];
    usage: EmbeddingUsage | null;
  }> {
    if (documents.length === 0) {
      return { written: 0, letters: [], usage: null };
    }

    let embedded: EmbeddedTexts;
    try {
      embedded = await this.embeddings.embedDocuments(documents.map((document) => document.text));
    } catch (error) {
      const reason = deadLetterReason(error);
      return {
        written: 0,
        letters: documents.map((document) => ({
          id: document.id,
          stage: INGESTION_STAGE.EMBED,
          reason,
        })),
        usage: null,
      };
    }

    const refused = await this.index.upsert(
      documents.map((document, position) => ({
        ...document,
        embedding: embedded.vectors[position],
      })),
    );
    return {
      written: documents.length - refused.length,
      letters: refused.map((failure) => ({
        id: failure.id,
        stage: INGESTION_STAGE.INDEX,
        reason: failure.reason,
      })),
      usage: embedded.usage,
    };
  }
}

function addUsage(total: EmbeddingUsage, more: EmbeddingUsage | null): EmbeddingUsage {
  if (more === null) {
    return total;
  }
  return {
    calls: total.calls + more.calls,
    inputTokens: total.inputTokens + more.inputTokens,
    // Rounded again, since adding many small float costs drifts in the last places.
    costUsd: Number((total.costUsd + more.costUsd).toFixed(COST_DECIMALS)),
  };
}
