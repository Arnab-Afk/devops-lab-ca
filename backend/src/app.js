const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const db = require('./db');
const mailer = require('./mailer');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const JWT_SECRET = () => process.env.JWT_SECRET || 'dev-secret';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', pod: process.env.HOSTNAME }));

// Step 1: sign up / log in with email -> receive a 6-digit code by email
app.post('/api/auth/request-code', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim() || email.split('@')[0];
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email' });

    const code = String(crypto.randomInt(100000, 1000000));
    await db.query(
      `INSERT INTO users (email, name, code, code_expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')
       ON CONFLICT (email) DO UPDATE SET code = $3, code_expires_at = NOW() + INTERVAL '10 minutes'`,
      [email, name, code]
    );
    await mailer.sendCode(email, name, code);
    res.json({ message: 'Verification code sent' });
  } catch (err) {
    next(err);
  }
});

// Step 2: verify code -> receive JWT
app.post('/api/auth/verify', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const { rows } = await db.query(
      `UPDATE users SET verified = TRUE, code = NULL, code_expires_at = NULL
       WHERE email = $1 AND code = $2 AND code_expires_at > NOW()
       RETURNING id, email, name`,
      [email, code]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid or expired code' });
    const user = rows[0];
    const token = jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET(), { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    req.user = jwt.verify(token, JWT_SECRET());
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Chat: clients poll with ?after=<lastId> (stateless, so it works across many pods)
app.get('/api/messages', auth, async (req, res, next) => {
  try {
    const after = Number(req.query.after) || 0;
    const { rows } = await db.query(
      `SELECT m.id, m.body, m.created_at, u.name, u.email
       FROM messages m JOIN users u ON u.id = m.user_id
       WHERE m.id > $1 ORDER BY m.id DESC LIMIT 50`,
      [after]
    );
    res.json(rows.reverse());
  } catch (err) {
    next(err);
  }
});

app.post('/api/messages', auth, async (req, res, next) => {
  try {
    const body = String(req.body.body || '').trim();
    if (!body || body.length > 1000) return res.status(400).json({ error: 'Message must be 1-1000 characters' });
    const { rows } = await db.query(
      'INSERT INTO messages (user_id, body) VALUES ($1, $2) RETURNING id, body, created_at',
      [req.user.sub, body]
    );
    res.status(201).json({ ...rows[0], name: req.user.name, email: req.user.email });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
