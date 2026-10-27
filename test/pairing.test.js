import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createStore, StoreError } from '../server/store.js';

const freshStore = (opts) => createStore(openDb(':memory:'), opts);

test('første gjest venter på partner', () => {
  const store = freshStore();
  const { guest, token } = store.register('Karin');
  assert.equal(guest.name, 'Karin');
  assert.equal(guest.partner, null);
  assert.ok(token.length > 20);
});

test('neste gjest blir paret med den som venter', () => {
  const store = freshStore();
  const karin = store.register('Karin');
  const ola = store.register('Ola');
  assert.equal(ola.guest.partner.name, 'Karin');
  assert.equal(store.guestByToken(karin.token).partner.name, 'Ola');
});

test('par forblir låst når nye gjester kommer', () => {
  const store = freshStore();
  const a = store.register('A');
  store.register('B');
  const c = store.register('C');
  const d = store.register('D');
  assert.equal(store.guestByToken(a.token).partner.name, 'B');
  assert.equal(c.guest.partner, null);
  assert.equal(d.guest.partner.name, 'C');
});

test('velger tilfeldig blant ventende gjester', () => {
  const db = openDb(':memory:');
  // Simulate two guests waiting (e.g. after admin split a pair)
  db.exec("INSERT INTO guests (name, name_key, token) VALUES ('A','a','ta'), ('B','b','tb')");
  const store = createStore(db, { pick: (n) => n - 1 });
  assert.equal(store.register('C').guest.partner.name, 'B');
});

test('navn trimmes og må være unike uavhengig av store/små bokstaver', () => {
  const store = freshStore();
  assert.equal(store.register('  Karin   Nordmann ').guest.name, 'Karin Nordmann');
  assert.throws(() => store.register('karin nordmann'), (e) => e instanceof StoreError && e.status === 409);
});

test('tomt eller for langt navn avvises', () => {
  const store = freshStore();
  assert.throws(() => store.register('   '), (e) => e.status === 400);
  assert.throws(() => store.register('x'.repeat(41)), (e) => e.status === 400);
});

test('ukjent token gir null', () => {
  assert.equal(freshStore().guestByToken('finnes-ikke'), null);
});
