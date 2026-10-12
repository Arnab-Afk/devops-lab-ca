require('dotenv').config();
const app = require('./app');
const db = require('./db');
const cache = require('./cache');

const PORT = process.env.PORT || 4000;

// In Kubernetes the database may still be starting: retry instead of crash-looping
async function initDbWithRetry(attempts = 20) {
  for (let i = 1; ; i++) {
    try {
      return await db.init();
    } catch (err) {
      if (i >= attempts) throw err;
      console.log(`Database not ready (${err.message}), retry ${i}/${attempts} in 3s`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function start() {
  await initDbWithRetry();
  await cache.connect();
  const server = app.listen(PORT, () => console.log(`API listening on :${PORT}`));

  // Kubernetes sends SIGTERM when the HPA scales down: finish in-flight requests, then release DB connections
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down');
    server.close(async () => {
      await Promise.allSettled([db.pool.end(), cache.close()]);
      process.exit(0);
    });
  });
}

start().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
