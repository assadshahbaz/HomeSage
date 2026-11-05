import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import * as z from 'zod';
import { DATABASE } from '../../infra/store/database.symbol.js';

/** What Vapi's end of call report says about a call. */
export interface CallRecord {
  readonly callId: string;
  readonly callerPhone: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly endedReason: string | null;
  readonly summary: string | null;
  readonly transcript: string | null;
}

export const callRowSchema = z.object({
  call_id: z.string(),
  received_at: z.string(),
  caller_phone: z.string().nullable(),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  ended_reason: z.string().nullable(),
  summary: z.string().nullable(),
  transcript: z.string().nullable(),
});

export type CallRow = z.infer<typeof callRowSchema>;

/** One row per finished call, so the agency can read what was said. */
@Injectable()
export class CallLogRepository {
  public constructor(@Inject(DATABASE) private readonly database: DatabaseSync) {}

  /** Stores a call's report. A repeated report for the same call replaces the first. */
  public record(call: CallRecord, now: Date): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO calls
           (call_id, received_at, caller_phone, started_at, ended_at, ended_reason, summary, transcript)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        call.callId,
        now.toISOString(),
        call.callerPhone,
        call.startedAt,
        call.endedAt,
        call.endedReason,
        call.summary,
        call.transcript,
      );
  }

  /** The most recent calls first. */
  public latest(limit: number): CallRow[] {
    const rows = this.database
      .prepare('SELECT * FROM calls ORDER BY received_at DESC LIMIT ?')
      .all(limit);
    return z.array(callRowSchema).parse(rows);
  }
}
