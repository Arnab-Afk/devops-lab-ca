const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connections opened by EACH pod. Under HPA: total = pods x DB_POOL_SIZE -> the DB bottleneck.
  max: Number(process.env.DB_POOL_SIZE || 10),
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 5000),
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('Idle DB client error', err.message));

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      code TEXT,
      code_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function stats() {
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, max: pool.options.max };
}

module.exports = { pool, query: (text, params) => pool.query(text, params), init, stats };
