import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import * as z from 'zod';
import { DATABASE } from '../../infra/store/database.symbol.js';
import { isUniqueViolation } from '../../infra/store/unique-violation.js';

/** A viewing to store. */
export interface NewViewing {
  readonly callId: string;
  readonly propertyRef: string;
  readonly propertyAddress: string;
  readonly slot: string;
  readonly callerName: string;
  readonly callerPhone: string | null;
  readonly notes: string | null;
}

export const viewingRowSchema = z.object({
  id: z.number(),
  created_at: z.string(),
  call_id: z.string(),
  property_ref: z.string(),
  property_address: z.string(),
  slot: z.string(),
  caller_name: z.string(),
  caller_phone: z.string().nullable(),
  notes: z.string().nullable(),
});

export type ViewingRow = z.infer<typeof viewingRowSchema>;

/** Viewings booked by phone, one per home per slot. */
@Injectable()
export class ViewingRepository {
  public constructor(@Inject(DATABASE) private readonly database: DatabaseSync) {}

  /** Stores a viewing, or answers `taken` when that home already has one in that slot. */
  public book(viewing: NewViewing, now: Date): 'booked' | 'taken' {
    try {
      this.database
        .prepare(
          `INSERT INTO viewings
             (created_at, call_id, property_ref, property_address, slot, caller_name, caller_phone, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          now.toISOString(),
          viewing.callId,
          viewing.propertyRef,
          viewing.propertyAddress,
          viewing.slot,
          viewing.callerName,
          viewing.callerPhone,
          viewing.notes,
        );
      return 'booked';
    } catch (error) {
      if (isUniqueViolation(error)) {
        return 'taken';
      }
      throw error;
    }
  }

  /** The slot ids already booked for a home. */
  public bookedSlots(propertyRef: string): Set<string> {
    const rows = this.database
      .prepare('SELECT slot FROM viewings WHERE property_ref = ?')
      .all(propertyRef);
    return new Set(
      z
        .array(z.object({ slot: z.string() }))
        .parse(rows)
        .map((row) => row.slot),
    );
  }

  /** The most recent viewings first. */
  public latest(limit: number): ViewingRow[] {
    const rows = this.database
      .prepare('SELECT * FROM viewings ORDER BY id DESC LIMIT ?')
      .all(limit);
    return z.array(viewingRowSchema).parse(rows);
  }
}
