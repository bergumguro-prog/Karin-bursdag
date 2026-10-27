import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { StoreError } from './store.js';

const SESSION_MS = 24 * 60 * 60 * 1000;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 5 * 60 * 1000;

const sha256 = (value) => createHash('sha256').update(String(value)).digest();

/**
 * Shared admin PIN. Tokens are stateless (expiry + HMAC signed with the PIN),
 * so admins stay logged in across server restarts, and changing the PIN logs everyone out.
 */
export function createAdminAuth(pin, { now = Date.now } = {}) {
  const failures = new Map();

  const sign = (expires) => createHmac('sha256', `admin:${pin}`).update(String(expires)).digest('base64url');

  function checkRateLimit(ip) {
    const entry = failures.get(ip);
    if (entry && now() - entry.since > FAILURE_WINDOW_MS) failures.delete(ip);
    if ((failures.get(ip)?.count ?? 0) >= MAX_FAILURES) {
      throw new StoreError(429, 'For mange forsøk – vent noen minutter');
    }
  }

  function recordFailure(ip) {
    const entry = failures.get(ip) ?? { count: 0, since: now() };
    entry.count += 1;
    failures.set(ip, entry);
  }

  function login(attempt, ip = 'unknown') {
    checkRateLimit(ip);
    if (!timingSafeEqual(sha256(attempt), sha256(pin))) {
      recordFailure(ip);
      throw new StoreError(401, 'Feil PIN');
    }
    failures.delete(ip);
    const expires = now() + SESSION_MS;
    return `${expires}.${sign(expires)}`;
  }

  function verify(token) {
    const [expires, signature] = String(token ?? '').split('.');
    if (!expires || !signature || Number(expires) < now()) return false;
    const expected = Buffer.from(sign(expires));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  /** Express middleware for /api/admin/* */
  function requireAdmin(req, _res, next) {
    if (!verify(req.get('X-Admin-Token'))) throw new StoreError(401, 'Kun for admin');
    next();
  }

  return { login, verify, requireAdmin };
}
