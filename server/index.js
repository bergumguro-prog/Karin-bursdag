import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';

const config = loadConfig();
const db = await openDb(config.db);
const app = createApp({ db, config });

app.listen(config.port, () => {
  console.log(`✨ ${config.eventTitle} kjører på http://localhost:${config.port}`);
  console.log(`   Database: ${config.db.url.startsWith('file:') ? config.db.url : 'Turso'}`);
  if (!process.env.ADMIN_PIN) {
    console.warn('⚠️  ADMIN_PIN er ikke satt – bruker standard-PIN 1234. Sett en egen før festen!');
  }
});
