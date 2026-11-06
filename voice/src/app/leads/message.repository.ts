import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import * as z from 'zod';
import { DATABASE } from '../../infra/store/database.symbol.js';

/** A message for the team, to store. */
export interface NewMessage {
  readonly callId: string;
  readonly callerName: string;
  readonly callerPhone: string | null;
  readonly about: string;
  readonly message: string;
}

export const messageRowSchema = z.object({
  id: z.number(),
  created_at: z.string(),
  call_id: z.string(),
  caller_name: z.string(),
  caller_phone: z.string().nullable(),
  about: z.string(),
  message: z.string(),
});

export type MessageRow = z.infer<typeof messageRowSchema>;

/** Messages the agent took for the team. */
@Injectable()
export class MessageRepository {
  public constructor(@Inject(DATABASE) private readonly database: DatabaseSync) {}

  /** Stores a message. */
  public add(message: NewMessage, now: Date): void {
    this.database
      .prepare(
        `INSERT INTO messages (created_at, call_id, caller_name, caller_phone, about, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        now.toISOString(),
        message.callId,
        message.callerName,
        message.callerPhone,
        message.about,
        message.message,
      );
  }

  /** The most recent messages first. */
  public latest(limit: number): MessageRow[] {
    const rows = this.database
      .prepare('SELECT * FROM messages ORDER BY id DESC LIMIT ?')
      .all(limit);
    return z.array(messageRowSchema).parse(rows);
  }
}
