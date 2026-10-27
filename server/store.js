import { randomBytes, randomInt } from 'node:crypto';
import { transaction } from './db.js';

export const MAX_NAME_LENGTH = 40;

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
    partnerOf: db.prepare('SELECT id, name FROM guests WHERE pair_id = ? AND id != ?'),
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
      partner: partner && { id: partner.id, name: partner.name },
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

  return { register, guestByToken };
}
