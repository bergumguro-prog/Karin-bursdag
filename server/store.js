import { randomBytes, randomInt } from 'node:crypto';

export const MAX_NAME_LENGTH = 40;
export const MAX_POINTS_PER_EVENT = 1000;
export const FEED_LENGTH = 15;

export class StoreError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function normalizeName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

const SQL = {
  guestById: 'SELECT id, name, pair_id FROM guests WHERE id = ?',
  guestByToken: 'SELECT id, name, pair_id FROM guests WHERE token = ?',
  guestByKey: 'SELECT id FROM guests WHERE name_key = ?',
  waiting: 'SELECT id FROM guests WHERE pair_id IS NULL ORDER BY id',
  pairById: 'SELECT id FROM pairs WHERE id = ?',
  partnerOf: `
    SELECT g.id, g.name, (SELECT COALESCE(SUM(delta), 0) FROM point_events WHERE guest_id = g.id) AS points
    FROM guests g WHERE g.pair_id = ? AND g.id != ?`,
  pointsOf: 'SELECT COALESCE(SUM(delta), 0) AS points FROM point_events WHERE guest_id = ?',
  guestsWithPoints: `
    SELECT g.id, g.name, g.pair_id, COALESCE(SUM(p.delta), 0) AS points
    FROM guests g LEFT JOIN point_events p ON p.guest_id = g.id
    GROUP BY g.id ORDER BY points DESC, g.id`,
  feed: `
    SELECT p.id, p.guest_id, g.name, p.delta, p.reason, p.created_at
    FROM point_events p JOIN guests g ON g.id = p.guest_id
    ORDER BY p.id DESC LIMIT ?`,
};

/** Statements that break up a pair, leaving both members waiting. */
const dissolve = (pairId) => [
  { sql: 'UPDATE guests SET pair_id = NULL WHERE pair_id = ?', args: [pairId] },
  { sql: 'DELETE FROM pairs WHERE id = ?', args: [pairId] },
];

/** Statements that create a pair of two guests (the pair id comes from last_insert_rowid()). */
const pairUp = (aId, bId) => [
  'INSERT INTO pairs DEFAULT VALUES',
  { sql: 'UPDATE guests SET pair_id = last_insert_rowid() WHERE id IN (?, ?)', args: [aId, bId] },
];

/**
 * All game logic lives here: guests, dance partners and points.
 * `pick(n)` returns a random index in [0, n) and can be swapped out in tests.
 */
export function createStore(db, { pick = (n) => randomInt(n) } = {}) {
  const one = async (sql, ...args) => (await db.execute({ sql, args })).rows[0] ?? null;
  const all = async (sql, ...args) => (await db.execute({ sql, args })).rows;

  // Writes run one at a time so e.g. two guests registering at the same moment
  // can't both be paired with the same waiting guest. The app runs as a single instance.
  let queue = Promise.resolve();
  const exclusive = (fn) => {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  };

  async function requireGuest(id) {
    const guest = await one(SQL.guestById, Number(id));
    if (!guest) throw new StoreError(404, 'Fant ikke gjesten');
    return guest;
  }

  async function describeGuest(guest) {
    const [mine, partner] = await Promise.all([
      one(SQL.pointsOf, guest.id),
      guest.pair_id == null ? null : one(SQL.partnerOf, guest.pair_id, guest.id),
    ]);
    return {
      id: guest.id,
      name: guest.name,
      points: mine.points,
      partner: partner && { id: partner.id, name: partner.name, points: partner.points },
    };
  }

  /** Registers a guest and pairs them with a random waiting guest, if any. */
  function register(rawName) {
    const name = normalizeName(rawName);
    if (!name) return Promise.reject(new StoreError(400, 'Skriv inn navnet ditt'));
    if (name.length > MAX_NAME_LENGTH) {
      return Promise.reject(new StoreError(400, `Navnet kan maks ha ${MAX_NAME_LENGTH} tegn`));
    }
    const key = name.toLocaleLowerCase('nb');

    return exclusive(async () => {
      if (await one(SQL.guestByKey, key)) {
        throw new StoreError(409, 'Det navnet er allerede tatt – legg til etternavn eller initial');
      }

      const token = randomBytes(24).toString('base64url');
      const waiting = await all(SQL.waiting);
      const statements = [{ sql: 'INSERT INTO guests (name, name_key, token) VALUES (?, ?, ?)', args: [name, key, token] }];
      if (waiting.length > 0) {
        const partnerId = waiting[pick(waiting.length)].id;
        statements.push(
          'INSERT INTO pairs DEFAULT VALUES',
          { sql: 'UPDATE guests SET pair_id = last_insert_rowid() WHERE token = ? OR id = ?', args: [token, partnerId] },
        );
      }
      await db.batch(statements, 'write');

      return { token, guest: await describeGuest(await one(SQL.guestByToken, token)) };
    });
  }

  async function guestByToken(token) {
    const guest = token ? await one(SQL.guestByToken, token) : null;
    return guest ? describeGuest(guest) : null;
  }

  /**
   * Gives (or with a negative delta, takes away) points from one or more guests.
   * All or nothing: if one guest doesn't exist, nobody gets points.
   */
  function givePoints(guestIds, delta, reason = '') {
    const amount = Number(delta);
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_POINTS_PER_EVENT) {
      return Promise.reject(
        new StoreError(400, `Poeng må være et heltall mellom -${MAX_POINTS_PER_EVENT} og ${MAX_POINTS_PER_EVENT}, men ikke 0`),
      );
    }
    const text = normalizeName(reason).slice(0, 80);

    return exclusive(async () => {
      const guests = await Promise.all(guestIds.map(requireGuest));
      const results = await db.batch(
        guests.map((g) => ({
          sql: 'INSERT INTO point_events (guest_id, delta, reason) VALUES (?, ?, ?)',
          args: [g.id, amount, text],
        })),
        'write',
      );
      return guests.map((g, i) => ({
        id: Number(results[i].lastInsertRowid),
        guestId: g.id,
        name: g.name,
        delta: amount,
        reason: text,
      }));
    });
  }

  async function addPoints(guestId, delta, reason) {
    const [event] = await givePoints([guestId], delta, reason);
    return event;
  }

  /** Snapshot of everything the scoreboard needs. A pair's total is the sum of both partners. */
  async function getState() {
    const [guestRows, feedRows] = await db.batch(
      [SQL.guestsWithPoints, { sql: SQL.feed, args: [FEED_LENGTH] }],
      'read',
    );

    const guests = guestRows.rows.map((g) => ({
      id: g.id,
      name: g.name,
      points: g.points,
      pairId: g.pair_id,
    }));

    const pairsById = new Map();
    for (const g of guests) {
      if (g.pairId == null) continue;
      if (!pairsById.has(g.pairId)) pairsById.set(g.pairId, { id: g.pairId, members: [], total: 0 });
      const pair = pairsById.get(g.pairId);
      pair.members.push({ id: g.id, name: g.name, points: g.points });
      pair.total += g.points;
    }
    const pairs = [...pairsById.values()].sort((a, b) => b.total - a.total || a.id - b.id);

    const feed = feedRows.rows.map((e) => ({
      id: e.id,
      guestId: e.guest_id,
      name: e.name,
      delta: e.delta,
      reason: e.reason,
      at: e.created_at,
    }));

    return {
      guests,
      pairs,
      waiting: guests.filter((g) => g.pairId == null).map(({ id, name }) => ({ id, name })),
      feed,
    };
  }

  /** Admin: locks two guests together. Their previous partners are left waiting. */
  function pairGuests(aId, bId) {
    return exclusive(async () => {
      if (Number(aId) === Number(bId)) throw new StoreError(400, 'Velg to forskjellige gjester');
      const a = await requireGuest(aId);
      const b = await requireGuest(bId);
      if (a.pair_id != null && a.pair_id === b.pair_id) throw new StoreError(400, 'De er allerede dansepartnere');

      const statements = [];
      if (a.pair_id != null) statements.push(...dissolve(a.pair_id));
      if (b.pair_id != null) statements.push(...dissolve(b.pair_id));
      statements.push(...pairUp(a.id, b.id));
      const results = await db.batch(statements, 'write');
      return Number(results.at(-2).lastInsertRowid);
    });
  }

  /** Admin: splits a pair, leaving both guests waiting. Points are kept. */
  function splitPair(pairId) {
    return exclusive(async () => {
      if (!(await one(SQL.pairById, Number(pairId)))) throw new StoreError(404, 'Fant ikke paret');
      await db.batch(dissolve(Number(pairId)), 'write');
    });
  }

  /** Admin: removes a guest and their points. Their partner is left waiting. */
  function removeGuest(guestId) {
    return exclusive(async () => {
      const guest = await requireGuest(guestId);
      await db.batch(
        [
          ...(guest.pair_id != null ? dissolve(guest.pair_id) : []),
          { sql: 'DELETE FROM point_events WHERE guest_id = ?', args: [guest.id] },
          { sql: 'DELETE FROM guests WHERE id = ?', args: [guest.id] },
        ],
        'write',
      );
    });
  }

  return { register, guestByToken, givePoints, addPoints, getState, pairGuests, splitPair, removeGuest };
}
