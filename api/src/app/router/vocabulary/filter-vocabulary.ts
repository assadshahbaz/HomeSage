import { Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import { MysqlService } from '../../../infra/mysql/mysql.service.js';

/** The place names the data holds, which a router filter may name and nothing else. */
export interface FilterValues {
  readonly towns: readonly string[];
  readonly postcodeDistricts: readonly string[];
}

interface ValueRow extends RowDataPacket {
  value: string;
}

const TOWNS_SQL =
  'SELECT DISTINCT town AS value FROM properties WHERE town IS NOT NULL ORDER BY town';
const DISTRICTS_SQL =
  'SELECT DISTINCT postcode_district AS value FROM properties WHERE postcode_district IS NOT NULL ORDER BY postcode_district';

/**
 * Reads the towns and postcode districts from MySQL once and keeps them. The
 * data is a fixed snapshot, so they never change while the API runs. A failed
 * read is not kept, so the next question tries again.
 */
@Injectable()
export class FilterVocabulary {
  private loading: Promise<FilterValues> | null = null;

  public constructor(private readonly mysql: MysqlService) {}

  /** The known values, read on first use. */
  public values(): Promise<FilterValues> {
    this.loading ??= this.load().catch((error: unknown) => {
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  private async load(): Promise<FilterValues> {
    const [towns, districts] = await Promise.all([
      this.mysql.query<ValueRow>(TOWNS_SQL),
      this.mysql.query<ValueRow>(DISTRICTS_SQL),
    ]);
    return {
      towns: towns.map((row) => row.value),
      postcodeDistricts: districts.map((row) => row.value),
    };
  }
}
