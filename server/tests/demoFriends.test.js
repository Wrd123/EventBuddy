const { useTestDatabase, api, registerUser } = require('./helpers');
const assert = require('node:assert/strict');
const http = require('node:http');
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const { WebSocket } = require('ws');
const { createApp } = require('../src/app');
const config = require('../src/config');
const realtime = require('../src/realtime/hub');
const demoFriends = require('../src/realtime/demoFriends');
const { signToken } = require('../src/middleware/auth');
const {
  createDemoWorld, seedDemoData, pruneDemoWorlds, idInWorld, DEMO_EVENT_IDS
} = require('../src/seed/demoData');
const Message = require('../src/models/Message');
const Expense = require('../src/models/Expense');
const Activity = require('../src/models/Activity');
const Event = require('../src/models/Event');
const User = require('../src/models/User');
const LocationShare = require('../src/models/LocationShare');

// Registered before useTestDatabase, so every story is stopped before its
// wipe: a beat still in flight could otherwise write into the next test
afterEach(() => {
  sockets.splice(0).forEach((ws) => ws.terminate());
  uninstall();
  uninstall = demoFriends.install();
  config.demoMode = true;
});

useTestDatabase();

const ORIGIN = 'http://localhost:3000';
const LEAVE_GRACE_MS = 500;
const realFetch = globalThis.fetch;
const originalTiming = { ...demoFriends.timing };
let server;
let url;
let uninstall;
const sockets = [];

before(async () => {
  server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, resolve));
  realtime.attach(server, { origins: [ORIGIN], limits: { authMs: 300, leaveGraceMs: LEAVE_GRACE_MS } });
  url = `ws://localhost:${server.address().port}${realtime.PATH}`;
  uninstall = demoFriends.install();
});

after(async () => {
  uninstall();
  Object.assign(demoFriends.timing, originalTiming);
  realtime.close();
  await new Promise((resolve) => server.close(resolve));
});

// Every test starts with quick friends and no sessions left over
beforeEach(() => {
  Object.assign(demoFriends.timing, originalTiming, { leadMs: [30, 30, 30], minMs: 30, maxMs: 30 });
});


const within = (promise, what, ms = 5000) => Promise.race([
  promise,
  new Promise((resolve, reject) => setTimeout(() => reject(new Error(`Timed out waiting for ${what}`)), ms))
]);

// Polls until check returns something truthy
const until = async (check, what, ms = 8000) => {
  const deadline = Date.now() + ms;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const connect = () => new Promise((resolve, reject) => {
  const ws = new WebSocket(url);
  sockets.push(ws);
  const inbox = [];
  const waiters = [];
  ws.inbox = inbox;
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    const waiter = waiters.findIndex((w) => w.match(message));
    if (waiter >= 0) waiters.splice(waiter, 1)[0].resolve(message);
    else inbox.push(message);
  });
  ws.closed = new Promise((done) => ws.on('close', (code) => done(code)));
  ws.next = (match, what = 'a message') => {
    const index = inbox.findIndex(match);
    if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
    return within(new Promise((done) => waiters.push({ match, resolve: done })), what);
  };
  ws.on('open', () => resolve(ws));
  ws.on('error', reject);
});

const logIn = async (person) => {
  const ws = await connect();
  ws.send(JSON.stringify({ type: 'auth', token: person.token }));
  await ws.next((m) => m.type === 'ready', 'ready');
  return ws;
};

const subscribe = async (ws, eventId) => {
  ws.send(JSON.stringify({ type: 'subscribe', eventId }));
  return ws.next((m) => m.eventId === eventId && ['subscribed', 'denied'].includes(m.type), 'an answer');
};

const poke = (eventId, what) => (m) => m.type === 'changed' && m.eventId === eventId && m.what === what;
const presenceWith = (eventId, ...userIds) => (m) =>
  m.type === 'presence' && m.eventId === eventId && userIds.every((id) => m.userIds.includes(String(id)));
const presenceWithout = (eventId, userId) => (m) =>
  m.type === 'presence' && m.eventId === eventId && !m.userIds.includes(String(userId));

// A private world and John, who is the visitor
const makeWorld = async () => {
  const john = await createDemoWorld();
  const tag = john.demoWorld;
  const id = (key) => idInWorld(tag, key);
  return {
    john,
    tag,
    person: { token: signToken(john), user: john },
    picnic: id('event:picnic'),
    festival: id('event:festival'),
    id: (name) => id(`user:${name}`),
    tokenOf: async (name) => `Bearer ${signToken(await User.findById(id(`user:${name}`)))}`
  };
};

const messagesIn = (world, text) => Message.countDocuments({ event: world.picnic, ...(text && { text }) });
const stepOf = async (world) => (await User.findById(world.john._id)).demoScriptStep || 0;
// The story is over (told, or cut short)
const finished = (world) => until(() => !demoFriends.telling(world.john._id), 'the story to end');
// The session itself is gone, and the friends with it
const ended = (world) => until(() => !demoFriends.running(world.john._id), 'the session to end');

// Replaces fetch with one that holds the first request (never answering
// until its signal aborts); every other request goes through. held.reached
// resolves with the held request's signal.
const holdFirstRequest = (t) => {
  let used = false;
  let reached;
  let aborted;
  const held = { reached: new Promise((resolve) => { reached = resolve; }), aborted: new Promise((resolve) => { aborted = resolve; }) };
  held.fetch = t.mock.method(globalThis, 'fetch', (target, init) => {
    if (used) return realFetch(target, init);
    used = true;
    reached(init.signal);
    return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => {
      aborted();
      reject(init.signal.reason);
    }));
  });
  return held;
};

describe('the scripted friends', () => {
  it('start when John opens the picnic: they chat, move, and are here', async () => {
    const world = await makeWorld();
    const ws = await logIn(world.person);
    await subscribe(ws, world.festival.toString());
    await subscribe(ws, world.picnic.toString());

    await ws.next(poke(world.picnic.toString(), 'chat'), 'a chat poke');
    const sorry = await Message.findOne({ event: world.picnic, text: /phone died/ });
    assert.equal(sorry.sender.name, 'Jordan');
    await until(async () => (await LocationShare.findOne({ event: world.picnic, user: world.id('Jordan') })).lat === 33.7836, "Jordan's pin to move");

    const friends = ['Alex', 'Taylor', 'Jordan'].map(world.id);
    await ws.next(presenceWith(world.picnic.toString(), ...friends, world.john._id), 'the friends here');
    // Only the picnic has them: the festival's presence is just John
    const festivalPresence = ws.inbox.filter((m) => m.type === 'presence' && m.eventId === world.festival.toString());
    assert.ok(festivalPresence.every((m) => friends.every((f) => !m.userIds.includes(String(f)))));
  });

  it('play the whole story once, then are done', async () => {
    const world = await makeWorld();
    const ws = await logIn(world.person);
    await subscribe(ws, world.picnic.toString());
    await finished(world);

    assert.equal(await Expense.countDocuments({ event: world.picnic, description: 'Ice cream' }), 1);
    assert.equal(await Activity.countDocuments({ event: world.picnic, kind: 'expense_added', 'data.description': 'Ice cream' }), 1);
    const ice = await Expense.findOne({ event: world.picnic, description: 'Ice cream' });
    assert.deepEqual(ice.shares.map((s) => s.amountCents), [450, 450, 450, 450]);
    const picnic = await Event.findById(world.picnic);
    assert.ok(picnic.schedule.some((item) => item.activity === 'Group photo' && item.startTime === '17:30'));
    const walk = picnic.schedule.find((item) => item.activity === 'Sunset walk');
    assert.ok(walk.attendees.some((a) => a.user.equals(world.id('Jordan'))));
    assert.equal(await messagesIn(world, "Ice cream's on me, it's in expenses 🍦"), 1);
    assert.equal(await messagesIn(world, 'Found you all! 👋'), 1);
    assert.equal(await stepOf(world), 7);
    const jordan = await LocationShare.findOne({ event: world.picnic, user: world.id('Jordan') });
    assert.deepEqual([jordan.lat, jordan.lng], [33.7857, -84.3741]);

    // With the story told, the friends stay here as long as John does
    const friends = ['Alex', 'Taylor', 'Jordan'].map(world.id);
    assert.equal(demoFriends.running(world.john._id), true);
    const fresh = await logIn(world.person);
    await subscribe(fresh, world.picnic.toString());
    await fresh.next(presenceWith(world.picnic.toString(), ...friends), 'the friends still here');
    assert.equal(await messagesIn(world, 'Found you all! 👋'), 1);

    // And they go when he does, and coming back later tells nothing again
    ws.terminate();
    fresh.terminate();
    await ended(world);
    const again = await logIn(world.person);
    await subscribe(again, world.picnic.toString());
    await finished(world);
    assert.equal(await messagesIn(world, 'Found you all! 👋'), 1);
    assert.equal(await stepOf(world), 7);
  });
});

describe('never for the wrong people', () => {
  const assertNothingStarts = async (person, eventId) => {
    const ws = await logIn(person);
    const answer = await subscribe(ws, eventId);
    assert.equal(answer.type, 'subscribed');
    // The hub announces a subscription in the same turn it answers it
    assert.equal(demoFriends.sessions.size, 0);
  };

  it('a registered user opening their own event', async () => {
    const user = await registerUser();
    const { body } = await api().post('/api/events').set('Authorization', user.auth)
      .send({ name: 'Mine', startDate: '2030-01-01', endDate: '2030-01-02' }).expect(201);
    await assertNothingStarts(user, body.event._id);
  });

  it("the shared development world's John", async () => {
    const john = await seedDemoData();
    await assertNothingStarts({ token: signToken(john) }, DEMO_EVENT_IDS.picnic.toString());
  });

  it("one of the world's friends", async () => {
    const world = await makeWorld();
    const token = signToken(await User.findById(world.id('Alex')));
    await assertNothingStarts({ token }, world.picnic.toString());
  });

  it('John opening another event', async () => {
    const world = await makeWorld();
    await assertNothingStarts(world.person, world.festival.toString());
  });

  it('outside demo mode', async () => {
    const world = await makeWorld();
    config.demoMode = false;
    await assertNothingStarts(world.person, world.picnic.toString());
  });

  it("and another world isn't touched by this one's story", async () => {
    const mine = await makeWorld();
    const other = await makeWorld();
    const ws = await logIn(mine.person);
    await subscribe(ws, mine.picnic.toString());
    await finished(mine);

    assert.equal(await Expense.countDocuments({ event: other.picnic, description: 'Ice cream' }), 0);
    assert.equal(await messagesIn(other), 0);
    assert.equal(await stepOf(other), 0);
  });
});

describe('lifecycle', () => {
  it('stops after the grace when John disconnects mid-request, and starts nothing more', async (t) => {
    const world = await makeWorld();
    // Far past the test's own deadlines, so only stopping can end the request
    demoFriends.timing.requestMs = 60000;
    const held = holdFirstRequest(t);
    const ws = await logIn(world.person);
    await subscribe(ws, world.picnic.toString());
    const signal = await within(held.reached, 'the held request');
    ws.terminate();

    await within(held.aborted, 'the request to be aborted', LEAVE_GRACE_MS + 1000);
    assert.equal(signal.aborted, true);
    await ended(world);
    assert.equal(await stepOf(world), 1);
    assert.equal(held.fetch.mock.callCount(), 1);
  });

  it('carries on, without a restart or doubled messages, when John reconnects within the grace', async () => {
    const world = await makeWorld();
    const first = await logIn(world.person);
    await subscribe(first, world.picnic.toString());
    await first.next(poke(world.picnic.toString(), 'chat'), 'a chat poke');
    const session = demoFriends.sessions.get(world.john._id.toString());
    first.terminate();

    const second = await logIn(world.person);
    await subscribe(second, world.picnic.toString());
    assert.equal(demoFriends.sessions.get(world.john._id.toString()), session);
    await finished(world);
    assert.equal(await messagesIn(world, 'Sorry, my phone died! Back now and on my way 🏃'), 1);
    assert.equal(await messagesIn(world, 'Found you all! 👋'), 1);
    assert.equal(await stepOf(world), 7);
  });

  it('resumes at the next beat when John comes back after the grace', async (t) => {
    const world = await makeWorld();
    demoFriends.timing.requestMs = 60000;
    const held = holdFirstRequest(t);
    const first = await logIn(world.person);
    await subscribe(first, world.picnic.toString());
    await within(held.reached, 'the held request');
    first.terminate();
    await within(held.aborted, 'the request to be aborted', LEAVE_GRACE_MS + 1000);
    await ended(world);
    assert.equal(await stepOf(world), 1);

    const second = await logIn(world.person);
    await subscribe(second, world.picnic.toString());
    await finished(world);
    // The first beat was claimed, so it isn't played again; the rest are
    assert.equal(await messagesIn(world, 'Sorry, my phone died! Back now and on my way 🏃'), 0);
    assert.equal(await Expense.countDocuments({ event: world.picnic, description: 'Ice cream' }), 1);
    assert.equal(await messagesIn(world, 'Found you all! 👋'), 1);
    assert.equal(await stepOf(world), 7);
  });

  it('keeps going while John still has another socket open', async () => {
    const world = await makeWorld();
    const first = await logIn(world.person);
    await logIn(world.person);
    await subscribe(first, world.picnic.toString());
    first.close();
    await first.closed;

    await finished(world);
    assert.equal(await stepOf(world), 7);
  });

  it('stops at once when John logs out', async () => {
    const world = await makeWorld();
    const ws = await logIn(world.person);
    await subscribe(ws, world.picnic.toString());
    assert.equal(demoFriends.running(world.john._id), true);

    await api().post('/api/auth/logout').set('Authorization', `Bearer ${world.person.token}`).expect(204);
    assert.equal(demoFriends.running(world.john._id), false);
  });

  it('stops every session when uninstalled', async () => {
    const one = await makeWorld();
    const two = await makeWorld();
    for (const world of [one, two]) await subscribe(await logIn(world.person), world.picnic.toString());
    assert.equal(demoFriends.sessions.size, 2);

    uninstall();
    assert.equal(demoFriends.sessions.size, 0);
    // And it no longer listens
    const three = await makeWorld();
    await subscribe(await logIn(three.person), three.picnic.toString());
    assert.equal(demoFriends.sessions.size, 0);
  });
});

describe('a beat that fails', () => {
  it("doesn't announce what didn't happen, and the story goes on", async (t) => {
    t.mock.method(globalThis, 'fetch', (target, init) =>
      String(target).endsWith('/expenses')
        ? Promise.resolve(new Response('{"message":"No."}', { status: 500 }))
        : realFetch(target, init));
    const world = await makeWorld();
    await subscribe(await logIn(world.person), world.picnic.toString());
    await finished(world);

    assert.equal(await Expense.countDocuments({ event: world.picnic, description: 'Ice cream' }), 0);
    assert.equal(await messagesIn(world, "Ice cream's on me, it's in expenses 🍦"), 0);
    const picnic = await Event.findById(world.picnic);
    assert.ok(picnic.schedule.some((item) => item.activity === 'Group photo'));
    assert.equal(await messagesIn(world, 'Found you all! 👋'), 1);
  });
});

describe('access', () => {
  // The first beat is quick; the second waits long enough to change things
  const slowSecondBeat = () => { demoFriends.timing.leadMs = [30, 1000, 30]; };
  const url = (world, ...rest) => ['/api/events', world.picnic, ...rest].join('/');

  it('Alex is no longer here, and his requests fail quietly, once Taylor removes him', async () => {
    slowSecondBeat();
    const world = await makeWorld();
    const ws = await logIn(world.person);
    await subscribe(ws, world.picnic.toString());
    await ws.next(poke(world.picnic.toString(), 'chat'), 'the first message');
    await ws.next(presenceWith(world.picnic.toString(), world.id('Alex')), 'Alex here');

    // Alex owes $18.15 across the seeded costs; Taylor records him paying it
    const taylor = await world.tokenOf('Taylor');
    await api().post(url(world, 'payments')).set('Authorization', taylor)
      .send({ from: world.id('Alex').toString(), to: world.id('Taylor').toString(), amountCents: 1815, date: '2030-01-01' })
      .expect(201);
    await api().delete(url(world, 'members', world.id('Alex').toString())).set('Authorization', taylor).expect(204);
    await ws.next(presenceWithout(world.picnic.toString(), world.id('Alex')), 'Alex gone');

    await finished(world);
    assert.equal(await Expense.countDocuments({ event: world.picnic, description: 'Ice cream' }), 0);
    assert.equal(await Message.countDocuments({ event: world.picnic, 'sender.user': world.id('Alex') }), 0);
    assert.equal(await messagesIn(world, 'Found you all! 👋'), 1);
  });

  it('ends when Taylor deletes the picnic', async () => {
    slowSecondBeat();
    const world = await makeWorld();
    const ws = await logIn(world.person);
    await subscribe(ws, world.picnic.toString());
    await ws.next(poke(world.picnic.toString(), 'chat'), 'the first message');

    await api().delete(url(world)).set('Authorization', await world.tokenOf('Taylor')).expect(204);
    await ended(world);
    assert.equal(await stepOf(world), 1);
  });

  it('ends when John settles up and leaves the picnic', async () => {
    slowSecondBeat();
    const world = await makeWorld();
    const ws = await logIn(world.person);
    await subscribe(ws, world.picnic.toString());
    await ws.next(poke(world.picnic.toString(), 'chat'), 'the first message');

    // John is owed $5.85; Alex pays it and John goes
    const auth = `Bearer ${world.person.token}`;
    await api().post(url(world, 'payments')).set('Authorization', auth)
      .send({ from: world.id('Alex').toString(), to: world.john._id.toString(), amountCents: 585, date: '2030-01-01' })
      .expect(201);
    await api().delete(url(world, 'members', world.john._id.toString())).set('Authorization', auth).expect(204);
    await ended(world);
    assert.equal(await stepOf(world), 1);
    assert.equal(await Expense.countDocuments({ event: world.picnic, description: 'Ice cream' }), 0);
  });

  it('ends when the world is pruned', async () => {
    slowSecondBeat();
    const world = await makeWorld();
    const ws = await logIn(world.person);
    await subscribe(ws, world.picnic.toString());
    await ws.next(poke(world.picnic.toString(), 'chat'), 'the first message');

    assert.equal(await pruneDemoWorlds({ maxAgeMs: -60000, maxWorlds: 10 }), 1);
    await ended(world);
    assert.equal(await Expense.countDocuments({ event: world.picnic, description: 'Ice cream' }), 0);
  });

  it("ends when John's account is gone, though the picnic is still there", async () => {
    slowSecondBeat();
    const world = await makeWorld();
    const ws = await logIn(world.person);
    await subscribe(ws, world.picnic.toString());
    await ws.next(poke(world.picnic.toString(), 'chat'), 'the first message');

    // The claim finds no John, so the story ends there
    await User.deleteOne({ _id: world.john._id });
    await ended(world);
    assert.equal(await Expense.countDocuments({ event: world.picnic, description: 'Ice cream' }), 0);
  });
});

describe('simulated presence', () => {
  it("never ends a real connection's presence", async () => {
    const user = await registerUser();
    const { body } = await api().post('/api/events').set('Authorization', user.auth)
      .send({ name: 'Mine', startDate: '2030-01-01', endDate: '2030-01-02' }).expect(201);
    const eventId = body.event._id;
    const ws = await logIn(user);
    await subscribe(ws, eventId);
    const userId = user.user._id.toString();

    realtime.simulatePresence([userId], eventId);
    const both = await ws.next(presenceWith(eventId, userId), 'presence with both');
    assert.deepEqual(both.userIds.filter((id) => id === userId), [userId], 'listed once');
    realtime.endSimulatedPresence([userId], eventId);
    // The real connection is still here
    const last = ws.inbox.filter((m) => m.type === 'presence').pop() || await ws.next((m) => m.type === 'presence');
    assert.ok(last.userIds.includes(userId));
  });
});
