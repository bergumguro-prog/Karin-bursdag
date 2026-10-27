import { randomBytes, randomInt } from 'node:crypto';
import { transaction } from './db.js';

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

/**
 * All game logic lives here: guests, dance partners and points.
 * `pick(n)` returns a random index in [0, n) and can be swapped out in tests.
 */
export function createStore(db, { pick = (n) => randomInt(n) } = {}) {
  const q = {
    guestById: db.prepare('SELECT id, name, pair_id FROM guests WHERE id = ?'),
    guestByToken: db.prepare('SELECT id, name, pair_id FROM guests WHERE token = ?'),
    guestByKey: db.prepare('SELECT id FROM guests WHERE name_key = ?'),
    insertGuest: db.prepare('INSERT INTO guests (name, name_key, token) VALUES (?, ?, ?)'),
    waiting: db.prepare('SELECT id FROM guests WHERE pair_id IS NULL AND id != ? ORDER BY id'),
    insertPair: db.prepare('INSERT INTO pairs DEFAULT VALUES'),
    setPair: db.prepare('UPDATE guests SET pair_id = ? WHERE id = ?'),
    pairById: db.prepare('SELECT id FROM pairs WHERE id = ?'),
    deletePair: db.prepare('DELETE FROM pairs WHERE id = ?'),
    deleteGuest: db.prepare('DELETE FROM guests WHERE id = ?'),
    partnerOf: db.prepare('SELECT id, name FROM guests WHERE pair_id = ? AND id != ?'),
    pointsOf: db.prepare('SELECT COALESCE(SUM(delta), 0) AS points FROM point_events WHERE guest_id = ?'),
    insertPoints: db.prepare('INSERT INTO point_events (guest_id, delta, reason) VALUES (?, ?, ?)'),
    guestsWithPoints: db.prepare(`
      SELECT g.id, g.name, g.pair_id, COALESCE(SUM(p.delta), 0) AS points
      FROM guests g LEFT JOIN point_events p ON p.guest_id = g.id
      GROUP BY g.id ORDER BY points DESC, g.id`),
    feed: db.prepare(`
      SELECT p.id, p.guest_id, g.name, p.delta, p.reason, p.created_at
      FROM point_events p JOIN guests g ON g.id = p.guest_id
      ORDER BY p.id DESC LIMIT ?`),
  };

  function requireGuest(id) {
    const guest = q.guestById.get(id);
    if (!guest) throw new StoreError(404, 'Fant ikke gjesten');
    return guest;
  }

  function createPair(aId, bId) {
    const pairId = Number(q.insertPair.run().lastInsertRowid);
    q.setPair.run(pairId, aId);
    q.setPair.run(pairId, bId);
    return pairId;
  }

  function partnerOf(guest) {
    if (guest.pair_id == null) return null;
    return q.partnerOf.get(guest.pair_id, guest.id) ?? null;
  }

  function describeGuest(guest) {
    const partner = partnerOf(guest);
    return {
      id: guest.id,
      name: guest.name,
      points: q.pointsOf.get(guest.id).points,
      partner: partner && { id: partner.id, name: partner.name, points: q.pointsOf.get(partner.id).points },
    };
  }

  /** Registers a guest and pairs them with a random waiting guest, if any. */
  function register(rawName) {
    const name = normalizeName(rawName);
    if (!name) throw new StoreError(400, 'Skriv inn navnet ditt');
    if (name.length > MAX_NAME_LENGTH) throw new StoreError(400, `Navnet kan maks ha ${MAX_NAME_LENGTH} tegn`);

    const key = name.toLocaleLowerCase('nb');
    if (q.guestByKey.get(key)) {
      throw new StoreError(409, 'Det navnet er allerede tatt – legg til etternavn eller initial');
    }

    return transaction(db, () => {
      const token = randomBytes(24).toString('base64url');
      const id = Number(q.insertGuest.run(name, key, token).lastInsertRowid);

      const waiting = q.waiting.all(id);
      if (waiting.length > 0) {
        createPair(id, waiting[pick(waiting.length)].id);
      }
      return { token, guest: describeGuest(requireGuest(id)) };
    });
  }

  function guestByToken(token) {
    const guest = token ? q.guestByToken.get(token) : undefined;
    return guest ? describeGuest(guest) : null;
  }

  /** Gives (or with a negative delta, takes away) points from a guest. */
  function addPoints(guestId, delta, reason = '') {
    const guest = requireGuest(guestId);
    const amount = Number(delta);
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_POINTS_PER_EVENT) {
      throw new StoreError(400, `Poeng må være et heltall mellom -${MAX_POINTS_PER_EVENT} og ${MAX_POINTS_PER_EVENT}, men ikke 0`);
    }
    const text = normalizeName(reason).slice(0, 80);
    const id = Number(q.insertPoints.run(guest.id, amount, text).lastInsertRowid);
    return { id, guestId: guest.id, name: guest.name, delta: amount, reason: text };
  }

  /** Snapshot of everything the scoreboard needs. A pair's total is the sum of both partners. */
  function getState() {
    const guests = q.guestsWithPoints.all().map((g) => ({
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

    const feed = q.feed.all(FEED_LENGTH).map((e) => ({
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
    if (Number(aId) === Number(bId)) throw new StoreError(400, 'Velg to forskjellige gjester');
    const a = requireGuest(aId);
    const b = requireGuest(bId);
    if (a.pair_id != null && a.pair_id === b.pair_id) throw new StoreError(400, 'De er allerede dansepartnere');
    return transaction(db, () => {
      dissolvePair(a.pair_id);
      dissolvePair(b.pair_id);
      return createPair(a.id, b.id);
    });
  }

  /** Admin: splits a pair, leaving both guests waiting. */
  function splitPair(pairId) {
    if (!q.pairById.get(pairId)) throw new StoreError(404, 'Fant ikke paret');
    dissolvePair(pairId);
  }

  /** Admin: removes a guest and their points. Their partner is left waiting. */
  function removeGuest(guestId) {
    const guest = requireGuest(guestId);
    transaction(db, () => {
      dissolvePair(guest.pair_id);
      q.deleteGuest.run(guest.id);
    });
  }

  function dissolvePair(pairId) {
    // guests.pair_id is ON DELETE SET NULL, so the members become waiting
    if (pairId != null) q.deletePair.run(pairId);
  }

  return { register, guestByToken, addPoints, getState, pairGuests, splitPair, removeGuest };
}
