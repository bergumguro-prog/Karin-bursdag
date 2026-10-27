import express from 'express';
import { fileURLToPath } from 'node:url';
import { createStore, StoreError } from './store.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

export function createApp({ db, config, store = createStore(db) }) {
  const app = express();
  app.use(express.json());

  app.get('/api/config', (_req, res) => {
    res.json({ eventTitle: config.eventTitle });
  });

  app.post('/api/register', (req, res) => {
    res.status(201).json(store.register(req.body?.name));
  });

  app.get('/api/me', (req, res) => {
    const guest = store.guestByToken(req.get('X-Guest-Token'));
    if (!guest) throw new StoreError(401, 'Ukjent gjest');
    res.json(guest);
  });

  app.use(express.static(PUBLIC_DIR));

  app.use((err, _req, res, _next) => {
    if (err instanceof StoreError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Noe gikk galt' });
  });

  return app;
}
