import { Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { MysqlService } from '../../../infra/mysql/mysql.service.js';
import { disclosureRowSchema, propertyRowSchema } from '../document/property-row.js';
import type { DisclosureRow, PropertyRow } from '../document/property-row.js';

// Fixed statements over the read only account, never model output, so they do
// not pass through the SQL validator. The column lists come from the row
// schemas, so a column the builder does not use is never read.
const PROPERTY_COLUMNS = Object.keys(propertyRowSchema.shape).join(', ');
const DISCLOSURE_COLUMNS = Object.keys(disclosureRowSchema.shape).join(', ');
const PAGE_SQL = `SELECT ${PROPERTY_COLUMNS} FROM properties WHERE id > ? ORDER BY id LIMIT ?`;
// Inclusive, since `updated_at` has second precision: a row changed in the same
// second the bound was taken is read again rather than missed.
const CHANGED_PAGE_SQL = `SELECT ${PROPERTY_COLUMNS} FROM properties WHERE updated_at >= ? AND id > ? ORDER BY id LIMIT ?`;
const NOW_SQL = 'SELECT NOW() AS now';
const DISCLOSURES_SQL = `SELECT ${DISCLOSURE_COLUMNS} FROM property_disclosures WHERE property_id IN (?)`;

const idSchema = z.object({ id: z.number().int().positive() });
const nowSchema = z.object({ now: z.date() });

/** A row that could not be read as a property, with its id when it had one. */
export interface UnreadableRow {
  readonly id: string;
  readonly reason: string;
}

/** One page of properties in id order, each with its disclosure row or none. */
export interface PropertyPage {
  readonly properties: readonly { property: PropertyRow; disclosure: DisclosureRow | null }[];
  readonly unreadable: readonly UnreadableRow[];
  /** The highest id on the page, where the next page starts. Null when there are no more rows. */
  readonly lastId: number | null;
}

/**
 * Reads properties from MySQL a page at a time, with each page's disclosure
 * rows fetched by id and joined in code. Pages go by id rather than by offset,
 * so a page start is a property id that a checkpoint can hold and a resumed
 * run can continue from.
 */
@Injectable()
export class PropertyReader {
  public constructor(private readonly mysql: MysqlService) {}

  /**
   * Up to `size` properties with ids above `afterId`. With `since`, only those
   * whose `updated_at` is at or after it, paged by id all the same.
   */
  public async readPage(afterId: number, size: number, since: Date | null): Promise<PropertyPage> {
    const rows =
      since === null
        ? await this.mysql.query<RowDataPacket>(PAGE_SQL, [afterId, size])
        : await this.mysql.query<RowDataPacket>(CHANGED_PAGE_SQL, [since, afterId, size]);
    if (rows.length === 0) {
      return { properties: [], unreadable: [], lastId: null };
    }

    // Parsed one row at a time, so one bad row goes to the dead letters rather
    // than failing the page.
    const properties: PropertyRow[] = [];
    const unreadable: UnreadableRow[] = [];
    for (const row of rows) {
      const parsed = propertyRowSchema.safeParse(row);
      if (parsed.success) {
        properties.push(parsed.data);
      } else {
        unreadable.push({
          id: rowId(row),
          reason: z.prettifyError(parsed.error).replace(/\n/g, ' '),
        });
      }
    }

    const disclosures = await this.disclosures(properties.map((property) => property.id));
    // A property whose questionnaire cannot be read is left out rather than
    // indexed without it, so a dead letter always means "not in the index".
    const readable = properties.filter((property) => {
      const reason = disclosures.unreadable.get(property.id);
      if (reason !== undefined) {
        unreadable.push({ id: String(property.id), reason: `disclosure row: ${reason}` });
      }
      return reason === undefined;
    });

    return {
      properties: readable.map((property) => ({
        property,
        disclosure: disclosures.rows.get(property.id) ?? null,
      })),
      unreadable,
      lastId: Math.max(...rows.map((row) => idSchema.parse(row).id)),
    };
  }

  /** The database clock, so a sync bound never depends on this machine agreeing with it. */
  public async now(): Promise<Date> {
    const [row] = await this.mysql.query<RowDataPacket>(NOW_SQL);
    return nowSchema.parse(row).now;
  }

  private async disclosures(ids: readonly number[]): Promise<{
    rows: Map<number, DisclosureRow>;
    unreadable: Map<number, string>;
  }> {
    const rows = new Map<number, DisclosureRow>();
    const unreadable = new Map<number, string>();
    if (ids.length === 0) {
      return { rows, unreadable };
    }
    for (const row of await this.mysql.query<RowDataPacket>(DISCLOSURES_SQL, [ids])) {
      const parsed = disclosureRowSchema.safeParse(row);
      if (parsed.success) {
        rows.set(parsed.data.property_id, parsed.data);
      } else {
        unreadable.set(
          Number(row['property_id']),
          z.prettifyError(parsed.error).replace(/\n/g, ' '),
        );
      }
    }
    return { rows, unreadable };
  }
}

function rowId(row: RowDataPacket): string {
  const parsed = idSchema.safeParse(row);
  return parsed.success ? String(parsed.data.id) : 'no id';
}
