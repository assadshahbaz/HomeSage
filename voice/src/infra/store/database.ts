import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const IN_MEMORY = ':memory:';

// Each statement is safe to run on every boot: tables and indexes are created
// only when missing, so an existing file keeps its rows.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS viewings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    call_id TEXT NOT NULL,
    property_ref TEXT NOT NULL,
    property_address TEXT NOT NULL,
    slot TEXT NOT NULL,
    caller_name TEXT NOT NULL,
    caller_phone TEXT,
    notes TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS viewings_property_slot ON viewings (property_ref, slot);

  CREATE TABLE IF NOT EXISTS valuation_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    call_id TEXT NOT NULL,
    caller_name TEXT NOT NULL,
    caller_phone TEXT,
    property_address TEXT NOT NULL,
    postcode TEXT,
    timeframe TEXT NOT NULL,
    is_also_buying INTEGER,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    call_id TEXT NOT NULL,
    caller_name TEXT NOT NULL,
    caller_phone TEXT,
    about TEXT NOT NULL,
    message TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS calls (
    call_id TEXT PRIMARY KEY,
    received_at TEXT NOT NULL,
    caller_phone TEXT,
    started_at TEXT,
    ended_at TEXT,
    ended_reason TEXT,
    summary TEXT,
    transcript TEXT
  );
`;

/**
 * Opens the SQLite file at `path`, creating its folder and tables when they are
 * missing. `:memory:` gives a throwaway database for tests.
 */
export function openDatabase(path: string): DatabaseSync {
  if (path !== IN_MEMORY) {
    mkdirSync(dirname(path), { recursive: true });
  }
  const database = new DatabaseSync(path);
  // Lets the admin endpoints read while a call is writing.
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec(SCHEMA);
  return database;
}
