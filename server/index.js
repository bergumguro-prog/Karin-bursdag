import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';

const config = loadConfig();
const db = openDb(config.dbPath);
const app = createApp({ db, config });

app.listen(config.port, () => {
  console.log(`✨ ${config.eventTitle} kjører på http://localhost:${config.port}`);
  if (!process.env.ADMIN_PIN) {
    console.warn('⚠️  ADMIN_PIN er ikke satt – bruker standard-PIN 1234. Sett en egen før festen!');
  }
});
