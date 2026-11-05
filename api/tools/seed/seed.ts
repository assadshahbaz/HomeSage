import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { disclosureColumns, toDisclosureInsert } from './disclosure-mapper.ts';
import { generateListings } from './listing-generator.ts';
import { dedupeByAddress, propertyColumns, toPropertyInsert } from './property-mapper.ts';

/**
 * Fills MySQL with the made up listings: `npm run db:seed`. Safe to run again,
 * since the schema is created if missing and rows are upserted by id.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BATCH_SIZE = 500;
const DEFAULT_MYSQL_PORT = 3306;

function connectionOptions(): mysql.ConnectionOptions {
  const password = process.env['MYSQL_ROOT_PASSWORD'];
  if (!password) {
    throw new Error('MYSQL_ROOT_PASSWORD is not set. Copy .env.example to .env and fill it in.');
  }
  return {
    host: process.env['MYSQL_HOST'] ?? '127.0.0.1',
    port: Number.parseInt(process.env['MYSQL_PORT'] ?? String(DEFAULT_MYSQL_PORT), 10),
    user: 'root',
    password,
    database: process.env['MYSQL_DATABASE'] ?? 'homesage',
    // The schema file holds more than one statement.
    multipleStatements: true,
  };
}

function upsertSql(table: string, columns: string[], rowCount: number): string {
  const placeholders = `(${columns.map(() => '?').join(', ')})`;
  const rows = Array.from({ length: rowCount }, () => placeholders).join(', ');
  const updates = columns
    .slice(1)
    .map((column) => `${column} = incoming.${column}`)
    .join(', ');
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${rows} AS incoming ON DUPLICATE KEY UPDATE ${updates}`;
}

async function upsert(
  connection: mysql.Connection,
  table: string,
  columns: string[],
  rows: readonly object[],
): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const values = batch.flatMap((row) =>
      columns.map((column) => (row as Record<string, unknown>)[column] ?? null),
    );
    await connection.query(upsertSql(table, columns, batch.length), values);
  }
}

async function run(): Promise<void> {
  const generated = generateListings();
  const { rows: properties, dropped } = dedupeByAddress(generated.properties.map(toPropertyInsert));
  const keptIds = new Set(properties.map((row) => row.id));
  const disclosures = generated.questionnaires
    .map(toDisclosureInsert)
    .filter((row) => keptIds.has(row.property_id));

  const connection = await mysql.createConnection(connectionOptions());
  try {
    await connection.query(await readFile(resolve(HERE, 'schema.sql'), 'utf8'));
    await upsert(connection, 'properties', propertyColumns(), properties);
    await upsert(connection, 'property_disclosures', disclosureColumns(), disclosures);
  } finally {
    await connection.end();
  }

  console.log(`Listings generated      ${String(generated.properties.length)}`);
  console.log(`Dropped as duplicates   ${String(dropped.length)}`);
  console.log(`Listings loaded         ${String(properties.length)}`);
  console.log(`Questionnaires loaded   ${String(disclosures.length)}`);
}

await run();
