import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';

test('openDb oppretter tabellene', () => {
  const db = openDb(':memory:');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name);
  assert.deepEqual(tables.filter((t) => !t.startsWith('sqlite_')), ['guests', 'pairs', 'point_events']);
});
