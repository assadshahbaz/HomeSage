import mysql from 'mysql2/promise';
import type { MysqlConfig } from '../config/mysql.config.js';

const CONNECTION_LIMIT = 10;
const UTC = '+00:00';

/**
 * The pool behind `MysqlService`, one function so every caller gets the same
 * settings. Times are UTC at both ends: the driver reads and writes `TIMESTAMP`
 * values as UTC rather than the process's local zone, and each session runs in
 * UTC whatever the server's default. Otherwise a machine an hour off UTC reads
 * every `updated_at` an hour off, and an incremental sync misses that hour.
 */
export function createMysqlPool(config: MysqlConfig): mysql.Pool {
  const pool = mysql.createPool({
    ...config,
    connectionLimit: CONNECTION_LIMIT,
    // Generated SQL is a single statement, checked by the validator. Allowing
    // more than one would let a rejected statement ride along with an accepted one.
    multipleStatements: false,
    timezone: UTC,
  });
  // Runs on each new connection before any query it is handed, since a
  // connection runs its statements in order. A connection that cannot be set
  // to UTC is destroyed, so the query waiting on it fails rather than reading
  // shifted times. The event hands over the callback connection underneath the
  // promise one, so it is heard on the core pool, whose types say so.
  pool.pool.on('connection', (connection) => {
    connection.query(`SET time_zone = '${UTC}'`, (error: Error | null) => {
      if (error !== null) {
        connection.destroy();
      }
    });
  });
  return pool;
}
