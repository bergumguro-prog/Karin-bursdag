import express from 'express';
import { fileURLToPath } from 'node:url';
import { createHub } from './events.js';
import { createStore, StoreError } from './store.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

export function createApp({ db, config, store = createStore(db), hub = createHub() }) {
  const app = express();
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

  app.use(express.static(PUBLIC_DIR));

  app.use((err, _req, res, _next) => {
    if (err instanceof StoreError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Noe gikk galt' });
  });

  return app;
}
