import express from 'express';
import { fileURLToPath } from 'node:url';
import { createAdminAuth } from './auth.js';
import { transaction } from './db.js';
import { createHub } from './events.js';
import { createStore, StoreError } from './store.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

export function createApp({
  db,
  config,
  store = createStore(db),
  hub = createHub(),
  auth = createAdminAuth(config.adminPin),
}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());

  /** Pushes the fresh state to every connected screen. */
  const publishState = () => hub.broadcast('state', store.getState());

  app.get('/api/config', (_req, res) => {
    res.json({ eventTitle: config.eventTitle });
  });

  app.post('/api/register', (req, res) => {
    const result = store.register(req.body?.name);
    publishState();
    res.status(201).json(result);
  });

  app.get('/api/me', (req, res) => {
    const guest = store.guestByToken(req.get('X-Guest-Token'));
    if (!guest) throw new StoreError(401, 'Ukjent gjest');
    res.json(guest);
  });

  app.get('/api/state', (_req, res) => {
    res.json(store.getState());
  });

  app.get('/api/events', hub.handler(() => store.getState()));

  // ---- Admin ----

  app.post('/api/admin/login', (req, res) => {
    res.json({ token: auth.login(req.body?.pin, req.ip) });
  });

  const admin = express.Router();
  admin.use(auth.requireAdmin);

  admin.get('/check', (_req, res) => res.json({ ok: true }));

  /** Body: { guestIds: number[], delta: number, reason?: string } */
  admin.post('/points', (req, res) => {
    const { guestIds, delta, reason } = req.body ?? {};
    if (!Array.isArray(guestIds) || guestIds.length === 0) throw new StoreError(400, 'Velg minst én gjest');
    const events = transaction(db, () => guestIds.map((id) => store.addPoints(id, delta, reason)));
    hub.broadcast('points', events);
    publishState();
    res.status(201).json(events);
  });

  /** Body: { a: guestId, b: guestId } */
  admin.post('/pairs', (req, res) => {
    const pairId = store.pairGuests(req.body?.a, req.body?.b);
    publishState();
    res.status(201).json({ pairId });
  });

  admin.delete('/pairs/:id', (req, res) => {
    store.splitPair(Number(req.params.id));
    publishState();
    res.status(204).end();
  });

  admin.delete('/guests/:id', (req, res) => {
    store.removeGuest(Number(req.params.id));
    publishState();
    res.status(204).end();
  });

  app.use('/api/admin', admin);

  app.use(express.static(PUBLIC_DIR));

  app.use((err, _req, res, _next) => {
    if (err instanceof StoreError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Noe gikk galt' });
  });

  return app;
}
