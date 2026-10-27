import express from 'express';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

export function createApp({ config }) {
  const app = express();
  app.use(express.json());

  app.get('/api/config', (_req, res) => {
    res.json({ eventTitle: config.eventTitle });
  });

  app.use(express.static(PUBLIC_DIR));

  return app;
}
