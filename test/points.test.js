import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createStore } from '../server/store.js';

function setup() {
  const store = createStore(openDb(':memory:'));
  const karin = store.register('Karin').guest;
  const ola = store.register('Ola').guest;
  const kari = store.register('Kari').guest;
  return { store, karin, ola, kari };
}

test('poeng summeres per person', () => {
  const { store, karin } = setup();
  store.addPoints(karin.id, 5, 'Beste dansemove');
  store.addPoints(karin.id, -1);
  const me = store.getState().guests.find((g) => g.id === karin.id);
  assert.equal(me.points, 4);
});

test('parets sum er summen av begge partnerne', () => {
  const { store, karin, ola } = setup();
  store.addPoints(karin.id, 3);
  store.addPoints(ola.id, 7);
  const [pair] = store.getState().pairs;
  assert.equal(pair.total, 10);
  assert.deepEqual(pair.members.map((m) => m.name).sort(), ['Karin', 'Ola']);
});

test('gjester uten partner vises som ventende og ikke som par', () => {
  const { store } = setup();
  const state = store.getState();
  assert.equal(state.pairs.length, 1);
  assert.deepEqual(state.waiting.map((g) => g.name), ['Kari']);
});

test('topplisten sorteres etter poeng', () => {
  const { store, ola, kari } = setup();
  store.addPoints(kari.id, 2);
  store.addPoints(ola.id, 9);
  assert.deepEqual(store.getState().guests.map((g) => g.name), ['Ola', 'Kari', 'Karin']);
});

test('feeden viser nyeste poeng først med begrunnelse', () => {
  const { store, karin, ola } = setup();
  store.addPoints(karin.id, 1, 'Første');
  store.addPoints(ola.id, 2, 'Andre');
  const [latest] = store.getState().feed;
  assert.equal(latest.name, 'Ola');
  assert.equal(latest.reason, 'Andre');
});

test('ugyldige poeng avvises', () => {
  const { store, karin } = setup();
  for (const bad of [0, 1.5, 'abc', 5000]) {
    assert.throws(() => store.addPoints(karin.id, bad), (e) => e.status === 400, String(bad));
  }
  assert.throws(() => store.addPoints(999, 1), (e) => e.status === 404);
});

test('meg-visningen inkluderer egne og partnerens poeng', () => {
  const store = createStore(openDb(':memory:'));
  const { token } = store.register('Karin');
  const ola = store.register('Ola').guest;
  store.addPoints(ola.id, 4);
  const me = store.guestByToken(token);
  assert.equal(me.points, 0);
  assert.equal(me.partner.points, 4);
});
