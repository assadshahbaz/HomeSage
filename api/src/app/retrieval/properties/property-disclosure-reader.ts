import { Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import { MysqlService } from '../../../infra/mysql/mysql.service.js';
import { disclosureRowSchema } from '../../ingestion/document/property-row.js';
import type { DisclosureRow } from '../../ingestion/document/property-row.js';

// The same columns the property document reads, so an answer sees what the
// index sees: suppliers, ownership length and the phone fields never reach it.
// A fixed statement with the ids bound, never model output.
const DISCLOSURE_COLUMNS = Object.keys(disclosureRowSchema.shape).join(', ');
const DISCLOSURES_SQL = `SELECT ${DISCLOSURE_COLUMNS} FROM property_disclosures WHERE property_id IN (?)`;

/** Reads what sellers said in their questionnaire about the properties retrieval found. */
@Injectable()
export class PropertyDisclosureReader {
  public constructor(private readonly mysql: MysqlService) {}

  /** The disclosure rows for `ids`, keyed by property id. A property with no questionnaire has no entry. */
  public async read(ids: readonly string[]): Promise<Map<string, DisclosureRow>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.mysql.query<RowDataPacket>(DISCLOSURES_SQL, [ids.map(Number)]);
    return new Map(
      rows.map((row) => {
        const disclosure = disclosureRowSchema.parse(row);
        return [String(disclosure.property_id), disclosure] as const;
      }),
    );
  }
}
