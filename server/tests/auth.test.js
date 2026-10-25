const { useTestDatabase, api, registerUser, assertFields } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');

useTestDatabase();

describe('POST /api/auth/register', () => {
  it('creates an account and returns a token and the user', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ firstName: 'Pat', lastName: 'Lee', username: 'PatLee', email: 'Pat@Example.com', password: 'secret123' })
      .expect(201);

    assert.equal(typeof res.body.token, 'string');
    assertFields(res.body.user, { name: 'Pat Lee', email: 'pat@example.com', username: 'patlee' });
  });

  it('never returns the password hash', async () => {
    const { user } = await registerUser();
    assert.equal('passwordHash' in user, false);
  });

  it('stores a bcrypt hash, not the password', async () => {
    const { user } = await registerUser({ password: 'secret123' });
    const stored = await User.findById(user._id).select('+passwordHash');

    assert.notEqual(stored.passwordHash, 'secret123');
    assert.match(stored.passwordHash, /^\$2[aby]\$/);
  });

  it('rejects an email that is already registered, ignoring case', async () => {
    await registerUser({ email: 'taken@example.com' });
    const res = await api()
      .post('/api/auth/register')
      .send({ username: 'someoneelse', email: 'TAKEN@example.com', password: 'secret123' })
      .expect(409);

    assert.equal(res.body.message, 'An account with this email already exists.');
  });

  it('rejects a username that is taken', async () => {
    await registerUser({ username: 'taken' });
    const res = await api()
      .post('/api/auth/register')
      .send({ username: 'taken', email: 'new@example.com', password: 'secret123' })
      .expect(409);

    assert.equal(res.body.message, 'That username is taken.');
  });

  const invalid = [
    ['an invalid email', { email: 'not-an-email' }, 'Please enter a valid email address.'],
    ['a short password', { password: '12345' }, 'Password must be at least 6 characters'],
    ['a password over 72 bytes', { password: 'a'.repeat(73) }, 'Password is too long.'],
    ['an invalid username', { username: 'a b' }, 'Username must be 3-30 letters, numbers, dots or underscores.']
  ];
  for (const [label, overrides, message] of invalid) {
    it(`rejects ${label}`, async () => {
      const res = await api()
        .post('/api/auth/register')
        .send({ username: 'valid_name', email: 'valid@example.com', password: 'secret123', ...overrides })
        .expect(400);

      assert.equal(res.body.message, message);
    });
  }
});

describe('POST /api/auth/login', () => {
  beforeEach(() => registerUser({ email: 'pat@example.com', password: 'secret123' }));

  it('logs in with the right password', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'pat@example.com', password: 'secret123' })
      .expect(200);

    assert.equal(typeof res.body.token, 'string');
    assert.equal(res.body.user.email, 'pat@example.com');
  });

  it('ignores email case', async () => {
    await api().post('/api/auth/login').send({ email: 'PAT@example.com', password: 'secret123' }).expect(200);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const wrongPassword = await api().post('/api/auth/login').send({ email: 'pat@example.com', password: 'nope' });
    const unknownEmail = await api().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'nope' });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.deepEqual(wrongPassword.body, unknownEmail.body);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the logged-in user', async () => {
    const { auth, user } = await registerUser();
    const res = await api().get('/api/auth/me').set('Authorization', auth).expect(200);

    assert.equal(res.body.user._id, user._id);
  });

  it('requires a token', async () => {
    await api().get('/api/auth/me').expect(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const { user } = await registerUser();
    const forged = jwt.sign({ sub: user._id }, 'someone-elses-secret');

    await api().get('/api/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('rejects an expired token', async () => {
    const { user } = await registerUser();
    const expired = jwt.sign({ sub: user._id, exp: Math.floor(Date.now() / 1000) - 60 }, 'test-secret');

    const res = await api().get('/api/auth/me').set('Authorization', `Bearer ${expired}`).expect(401);
    assert.equal(res.body.message, 'Your session has expired. Please log in again.');
  });

  it('rejects a token for a deleted account', async () => {
    const { auth, user } = await registerUser();
    await User.findByIdAndDelete(user._id);

    await api().get('/api/auth/me').set('Authorization', auth).expect(401);
  });
});

describe('PATCH /api/auth/me', () => {
  it('updates the name', async () => {
    const { auth } = await registerUser();
    const res = await api().patch('/api/auth/me').set('Authorization', auth).send({ name: 'New Name' }).expect(200);

    assert.equal(res.body.user.name, 'New Name');
  });

  it('rejects a blank name', async () => {
    const { auth } = await registerUser();
    await api().patch('/api/auth/me').set('Authorization', auth).send({ name: '   ' }).expect(400);
  });
});

describe('POST /api/auth/demo', () => {
  const config = require('../src/config');
  const { seedDemoData } = require('../src/seed/demoData');

  it('signs in as the demo user in demo mode', async () => {
    await seedDemoData();

    const res = await api().post('/api/auth/demo').expect(200);

    assert.equal(res.body.user.email, 'user@example.com');
    assert.equal(res.body.user.passwordHash, undefined);
    await api().get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`).expect(200);
  });

  it('says so while the demo data is still loading', async () => {
    const res = await api().post('/api/auth/demo').expect(503);
    assert.equal(res.body.message, 'The demo is still getting ready. Try again in a moment.');
  });

  it("doesn't exist outside demo mode", async () => {
    await seedDemoData();
    const original = config.demoMode;
    config.demoMode = false;
    try {
      await api().post('/api/auth/demo').expect(404);
    } finally {
      config.demoMode = original;
    }
  });

  it('is announced by the health check', async () => {
    const res = await api().get('/api/health').expect(200);
    assert.deepEqual(res.body, { status: 'ok', demo: true });
  });
});
