import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient } from '@libsql/client';

// Foreign keys aren't guaranteed to be enforced on a hosted database,
// so the store cleans up related rows itself instead of relying on cascades.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS pairs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS guests (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    name_key   TEXT NOT NULL UNIQUE,
    token      TEXT NOT NULL UNIQUE,
    pair_id    INTEGER REFERENCES pairs(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS point_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_id   INTEGER NOT NULL REFERENCES guests(id),
    delta      INTEGER NOT NULL,
    reason     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_guests_pair ON guests(pair_id);
  CREATE INDEX IF NOT EXISTS idx_points_guest ON point_events(guest_id);
`;

/**
 * Opens (and migrates) the database.
 * `url` is a Turso URL (libsql://…) in production, `file:path.db` locally or ':memory:' in tests.
 */
export async function openDb({ url, authToken }) {
  if (url.startsWith('file:')) mkdirSync(dirname(url.slice('file:'.length)), { recursive: true });
  const db = createClient({ url, authToken });
  await db.executeMultiple(SCHEMA);
  return db;
}
