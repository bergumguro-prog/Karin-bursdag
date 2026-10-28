import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { createAdminAuth } from '../server/auth.js';
import { openDb } from '../server/db.js';
import { createStore } from '../server/store.js';

// ---- Store: admin changes to pairs ----

async function fourGuests() {
  const store = createStore(await openDb({ url: ':memory:' }));
  const regs = [];
  for (const n of ['A', 'B', 'C', 'D']) regs.push(await store.register(n));
  return { store, a: regs[0], b: regs[1], c: regs[2], d: regs[3] };
}

const partnerName = async (store, reg) => (await store.guestByToken(reg.token))?.partner?.name ?? null;

test('admin kan pare om gjester – tidligere partnere blir ventende', async () => {
  const { store, a, b, c, d } = await fourGuests(); // A+B, C+D
  await store.pairGuests(a.guest.id, c.guest.id);
  assert.equal(await partnerName(store, a), 'C');
  assert.equal(await partnerName(store, b), null);
  assert.equal(await partnerName(store, d), null);
  assert.deepEqual((await store.getState()).waiting.map((g) => g.name), ['B', 'D']);
});

test('admin kan pare en ventende gjest uten å påvirke andre par', async () => {
  const { store, a, b, c } = await fourGuests();
  const e = await store.register('E'); // waiting
  await store.pairGuests(e.guest.id, a.guest.id);
  assert.equal(await partnerName(store, e), 'A');
  assert.equal(await partnerName(store, c), 'D');
  assert.equal(await partnerName(store, b), null);
});

test('admin kan splitte et par, poengene beholdes', async () => {
  const { store, a, b } = await fourGuests();
  await store.addPoints(a.guest.id, 5);
  const pairId = (await store.getState()).pairs.find((p) => p.members.some((m) => m.name === 'A')).id;
  await store.splitPair(pairId);
  assert.equal(await partnerName(store, a), null);
  assert.equal(await partnerName(store, b), null);
  assert.equal((await store.guestByToken(a.token)).points, 5);
});

test('fjernet gjest forsvinner med poengene sine, og partneren venter', async () => {
  const { store, a, b } = await fourGuests();
  await store.addPoints(a.guest.id, 3);
  await store.removeGuest(a.guest.id);
  assert.equal(await store.guestByToken(a.token), null);
  assert.equal(await partnerName(store, b), null);
  assert.equal((await store.getState()).feed.length, 0);
});

test('kan ikke pare en gjest med seg selv eller eksisterende partner', async () => {
  const { store, a, b } = await fourGuests();
  await assert.rejects(store.pairGuests(a.guest.id, a.guest.id), (e) => e.status === 400);
  await assert.rejects(store.pairGuests(a.guest.id, b.guest.id), (e) => e.status === 400);
});

// ---- Auth ----

test('admin-token verifiseres og utløper', () => {
  let clock = 1_000;
  const auth = createAdminAuth('4321', { now: () => clock });
  const token = auth.login('4321');
  assert.ok(auth.verify(token));
  assert.ok(!auth.verify(token + 'x'));
  assert.ok(!createAdminAuth('9999').verify(token), 'ny PIN logger ut');
  clock += 25 * 60 * 60 * 1000;
  assert.ok(!auth.verify(token));
});

test('feil PIN blir avvist og rate-limitet', () => {
  const auth = createAdminAuth('4321');
  for (let i = 0; i < 10; i++) assert.throws(() => auth.login('0000', 'ip'), (e) => e.status === 401);
  assert.throws(() => auth.login('4321', 'ip'), (e) => e.status === 429);
  assert.ok(auth.login('4321', 'annen-ip'));
});

// ---- HTTP ----

let server, base;
before(async () => {
  const app = createApp({ db: await openDb({ url: ':memory:' }), config: { adminPin: '4321', eventTitle: 'Test' } });
  await new Promise((resolve) => (server = app.listen(0, resolve)));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const call = (path, { body, method = body ? 'POST' : 'GET', headers = {} } = {}) =>
  fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body && JSON.stringify(body),
  });

test('kun admin kan gi poeng via API', async () => {
  const guest = await (await call('/api/register', { body: { name: 'Karin' } })).json();

  const denied = await call('/api/admin/points', { body: { guestIds: [guest.guest.id], delta: 5 } });
  assert.equal(denied.status, 401);

  const asGuest = await call('/api/admin/points', {
    body: { guestIds: [guest.guest.id], delta: 5 },
    headers: { 'X-Admin-Token': guest.token },
  });
  assert.equal(asGuest.status, 401);

  const { token } = await (await call('/api/admin/login', { body: { pin: '4321' } })).json();
  const ok = await call('/api/admin/points', {
    body: { guestIds: [guest.guest.id], delta: 5, reason: 'Bursdagsbarn' },
    headers: { 'X-Admin-Token': token },
  });
  assert.equal(ok.status, 201);

  const me = await (await call('/api/me', { headers: { 'X-Guest-Token': guest.token } })).json();
  assert.equal(me.points, 5);
});

test('poeng til flere gjester er alt-eller-ingenting', async () => {
  const guest = await (await call('/api/register', { body: { name: 'Ola' } })).json();
  const { token } = await (await call('/api/admin/login', { body: { pin: '4321' } })).json();
  const res = await call('/api/admin/points', {
    body: { guestIds: [guest.guest.id, 99999], delta: 3 },
    headers: { 'X-Admin-Token': token },
  });
  assert.equal(res.status, 404);
  const me = await (await call('/api/me', { headers: { 'X-Guest-Token': guest.token } })).json();
  assert.equal(me.points, 0);
});
