import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import * as z from 'zod';
import { DATABASE } from '../../infra/store/database.symbol.js';

/** A seller's request for a valuation, to store. */
export interface NewValuationRequest {
  readonly callId: string;
  readonly callerName: string;
  readonly callerPhone: string | null;
  readonly propertyAddress: string;
  readonly postcode: string | null;
  readonly timeframe: string;
  readonly isAlsoBuying: boolean | null;
  readonly notes: string | null;
}

export const valuationRequestRowSchema = z.object({
  id: z.number(),
  created_at: z.string(),
  call_id: z.string(),
  caller_name: z.string(),
  caller_phone: z.string().nullable(),
  property_address: z.string(),
  postcode: z.string().nullable(),
  timeframe: z.string(),
  // SQLite has no boolean, so the flag is stored as 0 or 1.
  is_also_buying: z
    .number()
    .nullable()
    .transform((value) => (value === null ? null : value === 1)),
  notes: z.string().nullable(),
});

export type ValuationRequestRow = z.infer<typeof valuationRequestRowSchema>;

/** Valuation requests from would be sellers, the agency's most valuable leads. */
@Injectable()
export class ValuationRequestRepository {
  public constructor(@Inject(DATABASE) private readonly database: DatabaseSync) {}

  /** Stores a request. */
  public add(request: NewValuationRequest, now: Date): void {
    this.database
      .prepare(
        `INSERT INTO valuation_requests
           (created_at, call_id, caller_name, caller_phone, property_address, postcode, timeframe, is_also_buying, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        now.toISOString(),
        request.callId,
        request.callerName,
        request.callerPhone,
        request.propertyAddress,
        request.postcode,
        request.timeframe,
        request.isAlsoBuying === null ? null : Number(request.isAlsoBuying),
        request.notes,
      );
  }

  /** The most recent requests first. */
  public latest(limit: number): ValuationRequestRow[] {
    const rows = this.database
      .prepare('SELECT * FROM valuation_requests ORDER BY id DESC LIMIT ?')
      .all(limit);
    return z.array(valuationRequestRowSchema).parse(rows);
  }
}
