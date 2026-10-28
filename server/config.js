export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    adminPin: env.ADMIN_PIN || '1234',
    eventTitle: env.EVENT_TITLE || 'Karins bursdag',
    // Turso in production, a local SQLite file otherwise
    db: {
      url: env.TURSO_DATABASE_URL || `file:${env.DB_PATH || 'data/bursdag.db'}`,
      authToken: env.TURSO_AUTH_TOKEN || undefined,
    },
  };
}
