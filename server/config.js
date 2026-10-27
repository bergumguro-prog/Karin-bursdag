export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    adminPin: env.ADMIN_PIN || '1234',
    eventTitle: env.EVENT_TITLE || 'Karins bursdag',
    dbPath: env.DB_PATH || 'data/bursdag.db',
  };
}
