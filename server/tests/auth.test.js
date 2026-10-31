const { useTestDatabase, api, registerUser, assertFields, holdDemoBuilds } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const Event = require('../src/models/Event');
const { createDemoWorld } = require('../src/seed/demoData');
const { signToken, authenticate } = require('../src/middleware/auth');
const { buildWorld } = require('../src/demoBuilds');

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
    ['a short password', { password: '1234567' }, 'Password must be at least 8 characters'],
    ['a common password', { password: 'Password123' }, 'That password is too common. Please choose another.'],
    ['a password that is the username', { password: 'valid_name' }, "Your password can't be your email or username."],
    ['a password that is the email', { password: 'Valid@example.com' }, "Your password can't be your email or username."],
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

  it('accepts a long passphrase with spaces and no digits or symbols', async () => {
    await api()
      .post('/api/auth/register')
      .send({ username: 'phrase', email: 'phrase@example.com', password: 'correct horse battery staple' })
      .expect(201);
  });
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

describe('sessions', () => {
  const me = (auth) => api().get('/api/auth/me').set('Authorization', auth);

  it("keeps the session version out of what's sent to the app", async () => {
    const { user } = await registerUser();
    assert.equal('sessionVersion' in user, false);
    assert.equal(user.isDemo, false);
  });

  it('still accepts a token issued before session versions existed', async () => {
    const { user } = await registerUser();
    const older = jwt.sign({ sub: user._id }, 'test-secret', { algorithm: 'HS256', expiresIn: '1h' });

    await me(`Bearer ${older}`).expect(200);
  });

  it('still lets an account with a password under the new minimum log in', async () => {
    await User.create({
      email: 'old@example.com', username: 'old', name: 'Old', passwordHash: await User.hashPassword('abc123')
    });
    await api().post('/api/auth/login').send({ email: 'old@example.com', password: 'abc123' }).expect(200);
  });
});

describe('POST /api/auth/logout', () => {
  const me = (auth) => api().get('/api/auth/me').set('Authorization', auth);

  it('ends the session on the server, including any copy of the token', async () => {
    const { auth } = await registerUser();
    const copy = auth;

    await api().post('/api/auth/logout').set('Authorization', auth).expect(204);

    const res = await me(copy).expect(401);
    assert.equal(res.body.message, 'Your session has expired. Please log in again.');
  });

  it('ends the login on other devices too', async () => {
    const { auth } = await registerUser({ email: 'two@example.com', password: 'secret123' });
    const other = await api().post('/api/auth/login').send({ email: 'two@example.com', password: 'secret123' }).expect(200);

    await api().post('/api/auth/logout').set('Authorization', auth).expect(204);

    await me(`Bearer ${other.body.token}`).expect(401);
  });

  it('lets you log in again afterwards', async () => {
    const { auth } = await registerUser({ email: 'back@example.com', password: 'secret123' });
    await api().post('/api/auth/logout').set('Authorization', auth).expect(204);

    const again = await api().post('/api/auth/login').send({ email: 'back@example.com', password: 'secret123' }).expect(200);
    await me(`Bearer ${again.body.token}`).expect(200);
  });

  it('needs a working session', async () => {
    const { auth } = await registerUser();
    await api().post('/api/auth/logout').set('Authorization', auth).expect(204);
    await api().post('/api/auth/logout').set('Authorization', auth).expect(401);
  });
});

describe('POST /api/auth/password', () => {
  const me = (auth) => api().get('/api/auth/me').set('Authorization', auth);
  const change = (auth, body) => api().post('/api/auth/password').set('Authorization', auth).send(body);
  const login = (password) => api().post('/api/auth/login').send({ email: 'pat@example.com', password });

  let account;
  beforeEach(async () => {
    account = await registerUser({ email: 'pat@example.com', username: 'pat', password: 'secret123' });
  });

  it('changes the password and keeps this device logged in', async () => {
    const res = await change(account.auth, { currentPassword: 'secret123', newPassword: 'a much longer one' }).expect(200);

    assert.equal(res.body.user.email, 'pat@example.com');
    await me(`Bearer ${res.body.token}`).expect(200);
    await login('a much longer one').expect(200);
    await login('secret123').expect(401);
  });

  it('logs out every other session, including the token it was sent with', async () => {
    const other = (await login('secret123').expect(200)).body.token;

    await change(account.auth, { currentPassword: 'secret123', newPassword: 'a much longer one' }).expect(200);

    await me(account.auth).expect(401);
    await me(`Bearer ${other}`).expect(401);
  });

  it('needs the current password, without ending the session', async () => {
    const res = await change(account.auth, { currentPassword: 'wrong-guess', newPassword: 'a much longer one' }).expect(400);

    assert.equal(res.body.message, "Your current password isn't right.");
    await me(account.auth).expect(200);
    await login('secret123').expect(200);
  });

  const invalid = [
    ['a short password', 'short', 'Password must be at least 8 characters'],
    ['a common password', 'iloveyou', 'That password is too common. Please choose another.'],
    ['the email', 'PAT@EXAMPLE.COM', "Your password can't be your email or username."],
    ['the same password', 'secret123', 'Choose a password different from your current one.']
  ];
  for (const [label, newPassword, message] of invalid) {
    it(`refuses ${label}`, async () => {
      const res = await change(account.auth, { currentPassword: 'secret123', newPassword }).expect(400);

      assert.equal(res.body.message, message);
      await login('secret123').expect(200);
    });
  }

  it('lets only one of two changes made at once with the same login through', async () => {
    // Both check the current password (slow, bcrypt) before either saves,
    // so only the "still the same session" check can turn one away
    const [first, second] = await Promise.all([
      change(account.auth, { currentPassword: 'secret123', newPassword: 'first new password' }),
      change(account.auth, { currentPassword: 'secret123', newPassword: 'second new password' })
    ]);

    assert.deepEqual([first.status, second.status].sort(), [200, 401]);
    const winner = first.status === 200 ? 'first new password' : 'second new password';
    const loser = first.status === 200 ? 'second new password' : 'first new password';
    await login(winner).expect(200);
    await login(loser).expect(401);
  });

  it('ignores anything but text', async () => {
    await change(account.auth, { currentPassword: { $ne: null }, newPassword: 'a much longer one' }).expect(400);
    await login('secret123').expect(200);
  });

  it('needs a login', async () => {
    await api().post('/api/auth/password').send({ currentPassword: 'secret123', newPassword: 'a much longer one' }).expect(401);
  });
});

describe('pruning while worlds are rebuilt', () => {
  // Codex's interleaving: two builds both prune at once and both find the
  // same old world. Held account deletes stand in for a slow database.
  it("never deletes a world that a saved login rebuilt after it was pruned", async (t) => {
    const john = await createDemoWorld();
    const tag = john.demoWorld;
    const token = signToken(john);
    // Old enough to prune
    await User.collection.updateMany({ demoWorld: tag }, { $set: { createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } });

    const deleteMany = User.deleteMany.bind(User);
    const held = [];
    let heldAny;
    const firstHeld = new Promise((resolve) => { heldAny = resolve; });
    let holding = true;
    t.mock.method(User, 'deleteMany', (...args) => {
      if (!holding) return deleteMany(...args);
      return new Promise((resolve, reject) => {
        held.push(() => deleteMany(...args).then(resolve, reject));
        heldAny();
      });
    });

    const builds = [buildWorld(() => createDemoWorld()), buildWorld(() => createDemoWorld())];
    await firstHeld;
    // Let the first prune finish deleting the old world
    held.shift()();
    const worldUsers = () => User.countDocuments({ demoWorld: tag });
    while ((await worldUsers()) > 0) await new Promise((resolve) => setImmediate(resolve));

    // John's saved login brings his world back, with the same ids
    holding = false;
    await authenticate(token);
    assert.equal(await worldUsers(), 6);

    // Whatever the other prune was holding now runs; it must not touch it
    held.splice(0).forEach((resume) => resume());
    await Promise.all(builds);
    assert.equal(await worldUsers(), 6);
    assert.equal(await Event.countDocuments({ 'members.user': john._id }), 4);
    assert.equal((await authenticate(token))._id.toString(), john._id.toString());
  });
});

describe('POST /api/auth/demo', () => {
  const config = require('../src/config');
  const mongoose = require('mongoose');
  const Event = require('../src/models/Event');
  const Message = require('../src/models/Message');
  const { seedDemoData, pruneDemoWorlds, dayIn } = require('../src/seed/demoData');

  const tryDemo = (body = {}) => api().post('/api/auth/demo').send(body).expect(201);
  const eventsFor = async (token) =>
    (await api().get('/api/events').set('Authorization', `Bearer ${token}`).expect(200)).body.events;

  it('signs you in as John in your own copy of the demo', async () => {
    const res = await tryDemo();

    assert.equal(res.body.user.name, 'John Doe');
    assert.equal(res.body.user.passwordHash, undefined);
    assert.equal(res.body.user.demoWorld, undefined);
    const events = await eventsFor(res.body.token);
    assert.deepEqual(events.map((e) => e.name).sort(), ['Beach Day', 'Hiking Trip', 'Picnic in the Park', 'Summer Music Festival']);
  });

  it("keeps each visitor's changes to themselves", async () => {
    const first = await tryDemo();
    const second = await tryDemo();
    assert.notEqual(first.body.user._id, second.body.user._id);

    await api().post('/api/events').set('Authorization', `Bearer ${first.body.token}`)
      .send({ name: 'Secret plan', type: 'concert', startDate: '2099-01-01', endDate: '2099-01-01' })
      .expect(201);

    const firstNames = (await eventsFor(first.body.token)).map((e) => e.name);
    const secondNames = (await eventsFor(second.body.token)).map((e) => e.name);
    assert.ok(firstNames.includes('Secret plan'));
    assert.ok(!secondNames.includes('Secret plan'));
    assert.equal(secondNames.length, 4);
  });

  it("puts the picnic on the visitor's own today", async () => {
    const tomorrowUtc = dayIn('UTC', Date.now() + 12 * 60 * 60 * 1000);
    const { body } = await tryDemo({ today: tomorrowUtc });
    const picnic = (await eventsFor(body.token)).find((e) => e.name === 'Picnic in the Park');
    assert.equal(picnic.startDate, tomorrowUtc);
  });

  it("falls back to Atlanta's today for a date that can't be anyone's today", async () => {
    const { body } = await tryDemo({ today: '1999-01-01' });
    const picnic = (await eventsFor(body.token)).find((e) => e.name === 'Picnic in the Park');
    assert.equal(picnic.startDate, dayIn('America/New_York'));
  });

  it('rebuilds your world for a saved login after the demo restarts empty', async () => {
    const { body } = await tryDemo();

    // A sleeping host wakes up with an empty database
    await mongoose.connection.dropDatabase();

    const res = await api().get('/api/auth/me').set('Authorization', `Bearer ${body.token}`).expect(200);
    assert.equal(res.body.user._id, body.user._id);
    assert.equal((await eventsFor(body.token)).length, 4);
  });

  it('rebuilds a world only once when requests arrive together', async () => {
    const { body } = await tryDemo();
    await mongoose.connection.dropDatabase();

    const auth = `Bearer ${body.token}`;
    await Promise.all([
      api().get('/api/events').set('Authorization', auth).expect(200),
      api().get('/api/chats').set('Authorization', auth).expect(200),
      api().get('/api/auth/me').set('Authorization', auth).expect(200)
    ]);
    assert.equal((await eventsFor(body.token)).length, 4);
  });

  it("can't be signed in to with a password", async () => {
    const { body } = await tryDemo();
    await api().post('/api/auth/login').send({ email: body.user.email, password: 'password' }).expect(401);
  });

  it('keeps only recent worlds, oldest out first, and leaves the shared one alone', async () => {
    await seedDemoData();
    const worlds = [];
    for (let i = 0; i < 3; i += 1) worlds.push((await tryDemo()).body);

    // Room for one more next to the newest
    assert.equal(await pruneDemoWorlds({ maxAgeMs: 60 * 60 * 1000, maxWorlds: 2 }), 2);

    assert.equal((await eventsFor(worlds[2].token)).length, 4);
    assert.equal(await User.countDocuments({ demoWorld: { $exists: true } }), 6);
    assert.equal(await User.countDocuments({ email: 'user@example.com' }), 1);
    // The shared world plus one private one
    assert.equal(await Event.countDocuments(), 8);
    assert.equal(await Message.countDocuments(), 12);
  });

  it('lets worlds go after a day', async () => {
    await tryDemo();
    assert.equal(await pruneDemoWorlds({ maxAgeMs: -1, maxWorlds: 100 }), 1);
    assert.equal(await User.countDocuments(), 0);
    // Everything in it goes too, the picnic's schedule and costs included
    const Expense = require('../src/models/Expense');
    const Payment = require('../src/models/Payment');
    const LocationShare = require('../src/models/LocationShare');
    assert.equal(await Event.countDocuments(), 0);
    assert.equal(await Expense.countDocuments(), 0);
    assert.equal(await Payment.countDocuments(), 0);
    assert.equal(await LocationShare.countDocuments(), 0);
    assert.equal(await Message.countDocuments(), 0);
  });

  it('tells the app it is a demo account', async () => {
    const { body } = await tryDemo();
    assert.equal(body.user.isDemo, true);
  });

  // Only while the world is there: one rebuilt after the demo restarts empty
  // starts over at the first session version (see the User model)
  it('can be logged out of on the server while its world exists', async () => {
    const { body } = await tryDemo();
    const auth = `Bearer ${body.token}`;

    await api().post('/api/auth/logout').set('Authorization', auth).expect(204);
    await api().get('/api/auth/me').set('Authorization', auth).expect(401);
  });

  it("doesn't exist outside demo mode", async () => {
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

// The per-address budget for new demo worlds and the shared build limit,
// run for real (the rest of the suite skips the rate limits) behind the
// proxy chain Render uses: X-Forwarded-For is
//   <anything the client sent>, visitor, Cloudflare, Render
// with TRUST_PROXY=3, so the visitor's address decides the budget. Each test
// uses its own addresses, since the limiter's counts are shared by every app
// in this process.
describe('the demo budget', () => {
  const http = require('node:http');
  const request = require('supertest');
  const { createApp } = require('../src/app');
  const demoData = require('../src/seed/demoData');
  const { buildWorld } = require('../src/demoBuilds');

  const chain = (visitor, claimed) => [claimed, visitor, '104.22.118.35', '10.29.98.5'].filter(Boolean).join(', ');
  const newWorldFor = (app, visitor, claimed) => request(app)
    .post('/api/auth/demo')
    .set('X-Forwarded-For', chain(visitor, claimed))
    .send({});
  const tooMany = "You've started a lot of demos. Please wait a little and try again.";

  it('gives each address 10 new worlds an hour, then says to wait', async () => {
    const app = createApp({ trustProxy: 3, rateLimits: true });
    for (let i = 0; i < 10; i += 1) await newWorldFor(app, '203.0.113.21').expect(201);

    const refused = await newWorldFor(app, '203.0.113.21').expect(429);
    assert.equal(refused.body.message, tooMany);
    assert.ok(Number(refused.headers['retry-after']) > 0);
    // Someone else is unaffected
    await newWorldFor(app, '203.0.113.22').expect(201);
  });

  it('counts two IPv6 addresses in one /56 block as one visitor', async () => {
    const app = createApp({ trustProxy: 3, rateLimits: true, demoLimit: 1 });
    await newWorldFor(app, '2001:db8:abcd:1200::1').expect(201);

    await newWorldFor(app, '2001:db8:abcd:12ff::2').expect(429);
    await newWorldFor(app, '2001:db8:abcd:1300::1').expect(201);
  });

  it("doesn't give a fresh budget to a client that claims to be someone else", async () => {
    const app = createApp({ trustProxy: 3, rateLimits: true, demoLimit: 1 });
    await newWorldFor(app, '203.0.113.23', '198.51.100.1').expect(201);

    await newWorldFor(app, '203.0.113.23', '198.51.100.2').expect(429);
    await newWorldFor(app, '203.0.113.23', '198.51.100.3, 192.0.2.9').expect(429);
  });

  it('is switched off in tests unless a test asks for it', async () => {
    const app = createApp({ demoLimit: 1 });
    await newWorldFor(app, '203.0.113.24').expect(201);
    await newWorldFor(app, '203.0.113.24').expect(201);
  });

  it('still counts a visit whose client gave up while the world was being built', async (t) => {
    const builds = holdDemoBuilds(t);
    const server = http.createServer(createApp({ trustProxy: 3, rateLimits: true, demoLimit: 1 }));
    await new Promise((resolve) => server.listen(0, resolve));
    t.after(() => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    });

    // The server's end of each connection, so the test can wait for the
    // server to have seen the client hang up
    const serverSockets = [];
    server.on('connection', (socket) => serverSockets.push(socket));
    const abandoned = http.request({
      port: server.address().port,
      method: 'POST',
      path: '/api/auth/demo',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': chain('203.0.113.25') }
    });
    abandoned.on('error', () => {});
    abandoned.end('{}');
    await builds.started(1);
    const hungUp = new Promise((resolve) => serverSockets[0].once('close', resolve));
    abandoned.destroy();
    await hungUp;
    builds.release();

    // The build carries on without its client, so the budget stays spent
    await newWorldFor(server, '203.0.113.25').expect(429);
    // Let it finish, so it isn't still using a slot in the next test
    while (buildWorld.running() > 0) await new Promise((resolve) => setImmediate(resolve));
  });

  it('gives a visit back when the server was too busy to start it', async (t) => {
    const builds = holdDemoBuilds(t);
    const app = createApp({ trustProxy: 3, rateLimits: true, demoLimit: 1 });
    const filling = [1, 2, 3, 4, 5].map((n) => newWorldFor(app, `203.0.113.${30 + n}`).expect(201).then((res) => res));
    await builds.started(5);

    const busy = await newWorldFor(app, '203.0.113.26').expect(503);
    assert.equal(busy.body.message, 'The demo is busy right now. Try again in a moment.');

    builds.release();
    await Promise.all(filling);
    // Nothing was built for the busy visit, so it didn't use the budget up
    await newWorldFor(app, '203.0.113.26').expect(201);
    await newWorldFor(app, '203.0.113.26').expect(429);
  });

  describe('saved logins that need their world rebuilt', () => {
    // A login whose world is gone, as after the host slept or a day passed
    const savedLoginWithoutWorld = async () => {
      const { body } = await api().post('/api/auth/demo').send({}).expect(201);
      assert.equal(await demoData.pruneDemoWorlds({ maxAgeMs: -1, maxWorlds: 100 }), 1);
      return `Bearer ${body.token}`;
    };

    it('share the limit on builds: a busy server says try again, not log in again', async (t) => {
      const auth = await savedLoginWithoutWorld();
      const builds = holdDemoBuilds(t);
      const filling = [1, 2, 3, 4, 5].map(() => api().post('/api/auth/demo').send({}).expect(201).then((res) => res));
      await builds.started(5);

      const busy = await api().get('/api/auth/me').set('Authorization', auth).expect(503);
      assert.equal(busy.body.message, 'The demo is busy right now. Try again in a moment.');

      builds.release();
      await Promise.all(filling);
      await api().get('/api/auth/me').set('Authorization', auth).expect(200);
    });

    it('still share one rebuild when requests arrive together', async (t) => {
      const auth = await savedLoginWithoutWorld();
      const prune = t.mock.method(demoData, 'pruneDemoWorlds');

      await Promise.all([
        api().get('/api/events').set('Authorization', auth).expect(200),
        api().get('/api/chats').set('Authorization', auth).expect(200),
        api().get('/api/auth/me').set('Authorization', auth).expect(200)
      ]);
      assert.equal(prune.mock.callCount(), 1);
    });

    it('prune old worlds first, so the cap on worlds holds', async (t) => {
      const auth = await savedLoginWithoutWorld();
      const prune = t.mock.method(demoData, 'pruneDemoWorlds');

      await api().get('/api/auth/me').set('Authorization', auth).expect(200);
      assert.equal(prune.mock.callCount(), 1);
      assert.deepEqual(prune.mock.calls[0].arguments, [{ maxAgeMs: 24 * 60 * 60 * 1000, maxWorlds: 300 }]);
    });

    it("don't count against the visitor's budget for new worlds", async () => {
      const app = createApp({ trustProxy: 3, rateLimits: true, demoLimit: 1 });
      const auth = await savedLoginWithoutWorld();

      for (let i = 0; i < 3; i += 1) {
        await request(app).get('/api/auth/me').set('Authorization', auth).set('X-Forwarded-For', chain('203.0.113.27')).expect(200);
        await demoData.pruneDemoWorlds({ maxAgeMs: -1, maxWorlds: 100 });
      }
      await newWorldFor(app, '203.0.113.27').expect(201);
    });
  });
});
