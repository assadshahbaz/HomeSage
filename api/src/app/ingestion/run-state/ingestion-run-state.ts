import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import type { ElasticsearchConfig } from '../../../infra/config/elasticsearch.config.js';
import { REDIS_CLIENT } from '../../../infra/redis/redis.symbol.js';
import type { IngestionMode } from '../ingestion-mode.js';

const KEY_PREFIX = 'homesage:ingestion';

/** Where in a run a document was lost. */
export const INGESTION_STAGE = {
  READ: 'read',
  EMBED: 'embed',
  INDEX: 'index',
} as const;

export type IngestionStage = (typeof INGESTION_STAGE)[keyof typeof INGESTION_STAGE];

/** One document a run could not index, and why. */
export interface DeadLetter {
  readonly id: string;
  readonly stage: IngestionStage;
  readonly reason: string;
}

const deadLetterSchema = z.object({
  id: z.string(),
  stage: z.enum(INGESTION_STAGE),
  reason: z.string(),
});
const checkpointSchema = z.coerce.number().int().positive();
const boundSchema = z.iso.datetime().transform((value) => new Date(value));

/**
 * What an ingestion run keeps outside its own process, in Redis: the last
 * property id whose page is safely in the index, and the documents it had to
 * leave out. Both are kept per index name, so a checkpoint for one index never
 * resumes a run on another. Only a full run has a checkpoint; dead letters are
 * kept per mode, so an incremental sync neither shows nor clears a full run's.
 * Redis in this stack writes to disk, so a checkpoint survives a restart of
 * Redis as well as of the run.
 */
@Injectable()
export class IngestionRunState {
  private readonly keyBase: string;

  public constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    configService: ConfigService,
  ) {
    const { index } = configService.getOrThrow<ElasticsearchConfig>('elasticsearch');
    this.keyBase = `${KEY_PREFIX}:${index}`;
  }

  /** The last property id a run finished with, or null when no run is part way through. */
  public async checkpoint(): Promise<number | null> {
    const value = await this.redis.get(this.checkpointKey());
    return value === null ? null : checkpointSchema.parse(value);
  }

  /** Records that every property up to `lastId` is in the index. */
  public async saveCheckpoint(lastId: number): Promise<void> {
    await this.redis.set(this.checkpointKey(), String(lastId));
  }

  /**
   * The moment a full run started reading, kept so a resumed run reports the
   * original bound for the next sync rather than the moment it resumed.
   */
  public async fullRunBound(): Promise<Date | null> {
    const value = await this.redis.get(this.boundKey());
    return value === null ? null : boundSchema.parse(value);
  }

  /** Records when a full run that starts from the beginning began reading. */
  public async saveFullRunBound(bound: Date): Promise<void> {
    await this.redis.set(this.boundKey(), bound.toISOString());
  }

  /**
   * Ends the run's claim to be part way through, so the next run starts from
   * the beginning. Its bound goes with it.
   */
  public async clearCheckpoint(): Promise<void> {
    await this.redis.del(this.checkpointKey(), this.boundKey());
  }

  /** Adds documents to the dead letter log of a run in this mode. */
  public async recordDeadLetters(
    mode: IngestionMode,
    letters: readonly DeadLetter[],
  ): Promise<void> {
    if (letters.length > 0) {
      await this.redis.rpush(
        this.deadLetterKey(mode),
        ...letters.map((letter) => JSON.stringify(letter)),
      );
    }
  }

  /** Every document the current run in this mode, and any run it resumed, had to leave out. */
  public async deadLetters(mode: IngestionMode): Promise<DeadLetter[]> {
    const entries = await this.redis.lrange(this.deadLetterKey(mode), 0, -1);
    return entries.map((entry) => deadLetterSchema.parse(JSON.parse(entry)));
  }

  /** Empties the dead letter log of this mode, for a run that starts afresh. */
  public async clearDeadLetters(mode: IngestionMode): Promise<void> {
    await this.redis.del(this.deadLetterKey(mode));
  }

  private checkpointKey(): string {
    return `${this.keyBase}:checkpoint`;
  }

  private boundKey(): string {
    return `${this.keyBase}:full:bound`;
  }

  private deadLetterKey(mode: IngestionMode): string {
    return `${this.keyBase}:${mode}:dead-letters`;
  }
}
