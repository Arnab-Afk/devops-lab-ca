jest.mock('../src/db', () => ({ query: jest.fn(), init: jest.fn() }));
jest.mock('../src/mailer', () => ({ sendCode: jest.fn() }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/db');
const mailer = require('../src/mailer');

const token = jwt.sign({ sub: 1, email: 'a@b.com', name: 'A' }, 'dev-secret');

beforeEach(() => jest.clearAllMocks());

test('GET /health returns ok', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
});

test('request-code rejects invalid email', async () => {
  const res = await request(app).post('/api/auth/request-code').send({ email: 'nope' });
  expect(res.status).toBe(400);
  expect(mailer.sendCode).not.toHaveBeenCalled();
});

test('request-code stores code and sends email', async () => {
  db.query.mockResolvedValue({ rows: [] });
  const res = await request(app).post('/api/auth/request-code').send({ email: 'Test@Example.com', name: 'Test' });
  expect(res.status).toBe(200);
  expect(db.query.mock.calls[0][1][0]).toBe('test@example.com');
  expect(mailer.sendCode).toHaveBeenCalledWith('test@example.com', 'Test', expect.stringMatching(/^\d{6}$/));
});

test('verify rejects wrong code', async () => {
  db.query.mockResolvedValue({ rows: [] });
  const res = await request(app).post('/api/auth/verify').send({ email: 'a@b.com', code: '000000' });
  expect(res.status).toBe(401);
});

test('verify returns a JWT for a correct code', async () => {
  db.query.mockResolvedValue({ rows: [{ id: 1, email: 'a@b.com', name: 'A' }] });
  const res = await request(app).post('/api/auth/verify').send({ email: 'a@b.com', code: '123456' });
  expect(res.status).toBe(200);
  expect(jwt.verify(res.body.token, 'dev-secret').sub).toBe(1);
});

test('messages require auth', async () => {
  const res = await request(app).get('/api/messages');
  expect(res.status).toBe(401);
});

test('post and list messages', async () => {
  db.query.mockResolvedValueOnce({ rows: [{ id: 5, body: 'hi', created_at: 'now' }] });
  const post = await request(app).post('/api/messages').set('Authorization', `Bearer ${token}`).send({ body: 'hi' });
  expect(post.status).toBe(201);
  expect(post.body).toMatchObject({ id: 5, body: 'hi', name: 'A' });

  db.query.mockResolvedValueOnce({ rows: [{ id: 6 }, { id: 5 }] });
  const list = await request(app).get('/api/messages?after=4').set('Authorization', `Bearer ${token}`);
  expect(list.body.map((m) => m.id)).toEqual([5, 6]);
});

test('rejects empty message', async () => {
  const res = await request(app).post('/api/messages').set('Authorization', `Bearer ${token}`).send({ body: '  ' });
  expect(res.status).toBe(400);
});
