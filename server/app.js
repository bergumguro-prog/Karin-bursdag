import express from 'express';
import { fileURLToPath } from 'node:url';
import { createAdminAuth } from './auth.js';
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

  /** Pushes the fresh state to every connected screen (after the response is sent). */
  const publishState = () =>
    store
      .getState()
      .then((state) => hub.broadcast('state', state))
      .catch((err) => console.error('Kunne ikke sende oppdatering', err));

  app.get('/healthz', (_req, res) => res.send('ok'));

  app.get('/api/config', (_req, res) => {
    res.json({ eventTitle: config.eventTitle });
  });

  app.post('/api/register', async (req, res) => {
    res.status(201).json(await store.register(req.body?.name));
    publishState();
  });

  app.get('/api/me', async (req, res) => {
    const guest = await store.guestByToken(req.get('X-Guest-Token'));
    if (!guest) throw new StoreError(401, 'Ukjent gjest');
    res.json(guest);
  });

  app.get('/api/state', async (_req, res) => {
    res.json(await store.getState());
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
  admin.post('/points', async (req, res) => {
    const { guestIds, delta, reason } = req.body ?? {};
    if (!Array.isArray(guestIds) || guestIds.length === 0) throw new StoreError(400, 'Velg minst én gjest');
    const events = await store.givePoints(guestIds, delta, reason);
    res.status(201).json(events);
    hub.broadcast('points', events);
    publishState();
  });

  /** Body: { a: guestId, b: guestId } */
  admin.post('/pairs', async (req, res) => {
    const pairId = await store.pairGuests(req.body?.a, req.body?.b);
    res.status(201).json({ pairId });
    publishState();
  });

  admin.delete('/pairs/:id', async (req, res) => {
    await store.splitPair(Number(req.params.id));
    res.status(204).end();
    publishState();
  });

  admin.delete('/guests/:id', async (req, res) => {
    await store.removeGuest(Number(req.params.id));
    res.status(204).end();
    publishState();
  });

  app.use('/api/admin', admin);

  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

  app.use((err, _req, res, _next) => {
    if (err instanceof StoreError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Noe gikk galt' });
  });

  return app;
}
