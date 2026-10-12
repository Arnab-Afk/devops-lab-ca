const { createClient } = require('redis');

// Optional Redis read-through cache. Enabled only when REDIS_URL is set (v2-pooled setup).
let client;

async function connect() {
  if (!process.env.REDIS_URL) return;
  client = createClient({ url: process.env.REDIS_URL });
  client.on('error', (err) => console.error('Redis error', err.message));
  await client.connect();
  console.log('Redis cache enabled');
}

async function wrap(key, ttlSeconds, fn) {
  if (!client?.isReady) return { value: await fn(), cached: false };
  const hit = await client.get(key);
  if (hit) return { value: JSON.parse(hit), cached: true };
  const value = await fn();
  await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  return { value, cached: false };
}

async function close() {
  if (client?.isOpen) await client.quit();
}

module.exports = { connect, wrap, close, enabled: () => Boolean(client?.isReady) };
