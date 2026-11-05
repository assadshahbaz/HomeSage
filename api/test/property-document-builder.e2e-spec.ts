import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { AppModule } from '../src/app.module.ts';
import { PropertyDocumentBuilder } from '../src/app/ingestion/document/property-document-builder.ts';
import {
  disclosureRowSchema,
  propertyRowSchema,
} from '../src/app/ingestion/document/property-row.ts';
import type { DisclosureRow } from '../src/app/ingestion/document/property-row.ts';
import { FORBIDDEN_WORD } from '../src/app/ingestion/document/seller-text.ts';
import { MysqlService } from '../src/infra/mysql/mysql.service.ts';

/**
 * Builds the document for every property in the local MySQL, through the read
 * only account, and checks what no golden string can: that no real row, with
 * its real seller text, produces a forbidden word. The data must be seeded
 * first (`npm run db:seed`).
 */
describe('PropertyDocumentBuilder over every row', () => {
  let app: TestingModule;
  let mysql: MysqlService;

  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    mysql = app.get(MysqlService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('builds one document per property, none with a forbidden word', async () => {
    const properties = z
      .array(propertyRowSchema)
      .parse(
        await mysql.query<RowDataPacket>(
          `SELECT ${Object.keys(propertyRowSchema.shape).join(', ')} FROM properties ORDER BY id`,
        ),
      );
    const disclosures = z
      .array(disclosureRowSchema)
      .parse(
        await mysql.query<RowDataPacket>(
          `SELECT ${Object.keys(disclosureRowSchema.shape).join(', ')} FROM property_disclosures`,
        ),
      );
    const byProperty = new Map<number, DisclosureRow>(
      disclosures.map((disclosure) => [disclosure.property_id, disclosure]),
    );
    const [{ total }] = z
      .array(z.object({ total: z.number() }))
      .length(1)
      .parse(await mysql.query<RowDataPacket>('SELECT COUNT(*) AS total FROM properties'));

    const builder = new PropertyDocumentBuilder();
    const documents = properties.map((property) =>
      builder.build(property, byProperty.get(property.id) ?? null),
    );
    const offending = documents.filter((document) => FORBIDDEN_WORD.test(document.text));
    const lengths = documents.map((document) => document.text.length).sort((a, b) => a - b);

    // The PR shows these numbers as the evidence of a real run.
    console.log(
      `built ${String(documents.length)} documents (${String(byProperty.size)} with a questionnaire), ` +
        `${String(offending.length)} with a forbidden word, text length ` +
        `min ${String(lengths[0])}, median ${String(lengths[Math.floor(lengths.length / 2)])}, ` +
        `max ${String(lengths[lengths.length - 1])}`,
    );

    expect(documents).toHaveLength(total);
    expect(new Set(documents.map((document) => document.id)).size).toBe(total);
    expect(offending.map((document) => document.id)).toEqual([]);
  });
});
