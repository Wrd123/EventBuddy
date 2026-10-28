const { useTestDatabase, api, registerUser } = require('./helpers');
const request = require('supertest');
const { createApp } = require('../src/app');
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

describe('the request address check', () => {
  it("isn't there unless it's switched on", async () => {
    await api().get('/api/debug/request-ip').expect(404);
  });

  it("shows the caller's address chain and the one the proxy setting picks", async () => {
    const app = createApp({ trustProxy: 2, showRequestIp: true });

    const res = await request(app).get('/api/debug/request-ip').set('X-Forwarded-For', '203.0.113.7, 198.51.100.2').expect(200);

    // Two trusted hops: the connection and the proxy before it, so the
    // address before those is the visitor's
    assert.equal(res.body.ip, '203.0.113.7');
    assert.equal(res.body.forwardedFor, '203.0.113.7, 198.51.100.2');
    assert.equal(res.body.trustProxy, 2);
    assert.ok(res.body.connectedFrom);
  });
});

// The login limit, run for real (the rest of the suite skips it) behind the
// proxy chain measured on Render on 27 Oct 2026, with TRUST_PROXY=3 as in
// render.yaml. Node is reached from a local proxy, behind Render's internal
// network, behind Cloudflare, which adds the visitor's address:
//   X-Forwarded-For: <anything the client sent>, visitor, Cloudflare, Render
// So the visitor's address decides the bucket, and whatever a client puts
// in front of it doesn't. Each test uses its own addresses, since the
// limiter's counts are shared by every app in this process.
describe('the login limit behind Render', () => {
  const behindRender = createApp({ trustProxy: 3, rateLimits: true });
  const attempt = (visitor, claimed) => request(behindRender)
    .post('/api/auth/login')
    .set('X-Forwarded-For', [claimed, visitor, '104.22.118.35', '10.29.98.5'].filter(Boolean).join(', '))
    .send({ email: 'nobody@example.com', password: 'wrong-password' });

  it('stops a visitor after 20 attempts, whatever they claim to be', async () => {
    for (let i = 0; i < 20; i += 1) await attempt('203.0.113.7', `198.51.100.${i}`).expect(401);
    const refused = await attempt('203.0.113.7', '198.51.100.99').expect(429);
    assert.equal(refused.body.message, 'Too many attempts. Please wait a few minutes and try again.');
  });

  it('counts each visitor on their own', async () => {
    for (let i = 0; i < 20; i += 1) await attempt('203.0.113.8').expect(401);
    await attempt('203.0.113.8').expect(429);
    await attempt('203.0.113.9').expect(401);
  });
});
