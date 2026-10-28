import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createStore } from '../server/store.js';

async function setup() {
  const store = createStore(await openDb({ url: ':memory:' }));
  const karin = (await store.register('Karin')).guest;
  const ola = (await store.register('Ola')).guest;
  const kari = (await store.register('Kari')).guest;
  return { store, karin, ola, kari };
}

test('poeng summeres per person', async () => {
  const { store, karin } = await setup();
  await store.addPoints(karin.id, 5, 'Beste dansemove');
  await store.addPoints(karin.id, -1);
  const me = (await store.getState()).guests.find((g) => g.id === karin.id);
  assert.equal(me.points, 4);
});

test('parets sum er summen av begge partnerne', async () => {
  const { store, karin, ola } = await setup();
  await store.addPoints(karin.id, 3);
  await store.addPoints(ola.id, 7);
  const [pair] = (await store.getState()).pairs;
  assert.equal(pair.total, 10);
  assert.deepEqual(pair.members.map((m) => m.name).sort(), ['Karin', 'Ola']);
});

test('gjester uten partner vises som ventende og ikke som par', async () => {
  const { store } = await setup();
  const state = await store.getState();
  assert.equal(state.pairs.length, 1);
  assert.deepEqual(state.waiting.map((g) => g.name), ['Kari']);
});

test('topplisten sorteres etter poeng', async () => {
  const { store, ola, kari } = await setup();
  await store.addPoints(kari.id, 2);
  await store.addPoints(ola.id, 9);
  assert.deepEqual((await store.getState()).guests.map((g) => g.name), ['Ola', 'Kari', 'Karin']);
});

test('feeden viser nyeste poeng først med begrunnelse', async () => {
  const { store, karin, ola } = await setup();
  await store.addPoints(karin.id, 1, 'Første');
  await store.addPoints(ola.id, 2, 'Andre');
  const [latest] = (await store.getState()).feed;
  assert.equal(latest.name, 'Ola');
  assert.equal(latest.reason, 'Andre');
});

test('ugyldige poeng avvises', async () => {
  const { store, karin } = await setup();
  for (const bad of [0, 1.5, 'abc', 5000]) {
    await assert.rejects(store.addPoints(karin.id, bad), (e) => e.status === 400, String(bad));
  }
  await assert.rejects(store.addPoints(999, 1), (e) => e.status === 404);
});

test('poeng til flere gjester er alt-eller-ingenting', async () => {
  const { store, karin } = await setup();
  await assert.rejects(store.givePoints([karin.id, 999], 3), (e) => e.status === 404);
  assert.equal((await store.getState()).feed.length, 0);
});

test('meg-visningen inkluderer egne og partnerens poeng', async () => {
  const store = createStore(await openDb({ url: ':memory:' }));
  const { token } = await store.register('Karin');
  const ola = (await store.register('Ola')).guest;
  await store.addPoints(ola.id, 4);
  const me = await store.guestByToken(token);
  assert.equal(me.points, 0);
  assert.equal(me.partner.points, 4);
});
