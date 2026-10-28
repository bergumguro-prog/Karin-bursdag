import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createStore, StoreError } from '../server/store.js';

const freshStore = async (opts) => createStore(await openDb({ url: ':memory:' }), opts);

test('første gjest venter på partner', async () => {
  const store = await freshStore();
  const { guest, token } = await store.register('Karin');
  assert.equal(guest.name, 'Karin');
  assert.equal(guest.partner, null);
  assert.ok(token.length > 20);
});

test('neste gjest blir paret med den som venter', async () => {
  const store = await freshStore();
  const karin = await store.register('Karin');
  const ola = await store.register('Ola');
  assert.equal(ola.guest.partner.name, 'Karin');
  assert.equal((await store.guestByToken(karin.token)).partner.name, 'Ola');
});

test('par forblir låst når nye gjester kommer', async () => {
  const store = await freshStore();
  const a = await store.register('A');
  await store.register('B');
  const c = await store.register('C');
  const d = await store.register('D');
  assert.equal((await store.guestByToken(a.token)).partner.name, 'B');
  assert.equal(c.guest.partner, null);
  assert.equal(d.guest.partner.name, 'C');
});

test('velger tilfeldig blant ventende gjester', async () => {
  const db = await openDb({ url: ':memory:' });
  // Simulate two guests waiting (e.g. after admin split a pair)
  await db.execute("INSERT INTO guests (name, name_key, token) VALUES ('A','a','ta'), ('B','b','tb')");
  const store = createStore(db, { pick: (n) => n - 1 });
  assert.equal((await store.register('C')).guest.partner.name, 'B');
});

test('samtidige registreringer pares aldri med samme person', async () => {
  const store = await freshStore();
  await Promise.all(Array.from({ length: 21 }, (_, i) => store.register(`Gjest ${i}`)));
  const state = await store.getState();
  assert.equal(state.pairs.length, 10);
  assert.ok(state.pairs.every((p) => p.members.length === 2));
  assert.equal(state.waiting.length, 1);
});

test('navn trimmes og må være unike uavhengig av store/små bokstaver', async () => {
  const store = await freshStore();
  assert.equal((await store.register('  Karin   Nordmann ')).guest.name, 'Karin Nordmann');
  await assert.rejects(store.register('karin nordmann'), (e) => e instanceof StoreError && e.status === 409);
});

test('tomt eller for langt navn avvises', async () => {
  const store = await freshStore();
  await assert.rejects(store.register('   '), (e) => e.status === 400);
  await assert.rejects(store.register('x'.repeat(41)), (e) => e.status === 400);
});

test('ukjent token gir null', async () => {
  assert.equal(await (await freshStore()).guestByToken('finnes-ikke'), null);
});
