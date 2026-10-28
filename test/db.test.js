import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';

test('openDb oppretter tabellene', async () => {
  const db = await openDb({ url: ':memory:' });
  const { rows } = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  assert.deepEqual(rows.map((r) => r.name).filter((t) => !t.startsWith('sqlite_')), ['guests', 'pairs', 'point_events']);
});

test('openDb kan kjøres flere ganger på samme database', async () => {
  const db = await openDb({ url: ':memory:' });
  await assert.doesNotReject(db.executeMultiple('CREATE TABLE IF NOT EXISTS pairs (id INTEGER)'));
});
