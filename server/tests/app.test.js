const { useTestDatabase, api, registerUser } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

useTestDatabase();

describe('every API answer', () => {
  it('may not be kept by a browser or cache, signed in or not', async () => {
    const { auth } = await registerUser();

    const me = await api().get('/api/auth/me').set('Authorization', auth).expect(200);
    const health = await api().get('/api/health').expect(200);
    const missing = await api().get('/api/nowhere').expect(404);

    for (const res of [me, health, missing]) assert.equal(res.headers['cache-control'], 'no-store');
  });
});

describe('request bodies', () => {
  it('turns away a body over the size limit with 413, not a server error', async () => {
    const res = await api()
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@example.com', password: 'x'.repeat(110 * 1024) }))
      .expect(413);

    assert.equal(res.body.message, "That's too much to send at once.");
  });

  it('still answers malformed JSON with 400', async () => {
    const res = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{not json').expect(400);
    assert.equal(res.body.message, 'Invalid JSON.');
  });
});
