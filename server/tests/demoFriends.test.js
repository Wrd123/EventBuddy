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
  Object.assign(demoFriends.timing, originalTiming, { leadMs: [30, 30, 30], minMs: 30, maxMs: 30, walkMs: 15 });
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

// Every position Jordan's share is given, in order, while the mock is in place
const recordJordan = (t, world) => {
  const original = LocationShare.updateOne;
  const seen = [];
  t.mock.method(LocationShare, 'updateOne', function record(filter, update, ...rest) {
    if (String(filter?.user) === String(world.id('Jordan'))) seen.push([update.$set.lat, update.$set.lng]);
    return original.call(this, filter, update, ...rest);
  });
  return seen;
};

describe('walking', () => {
  it("Jordan's pin passes through points between the start and the dock, in order, and ends there", async (t) => {
    const world = await makeWorld();
    const seen = recordJordan(t, world);
    await subscribe(await logIn(world.person), world.picnic.toString());
    await finished(world);

    // The first beat's jump, then ten steps to the halfway point, then ten to the dock
    assert.equal(seen.length, 21);
    assert.deepEqual(seen[0], [33.7836, -84.3762]);
    assert.deepEqual(seen.at(-1), [33.7857, -84.3741]);
    const walked = seen.slice(1);
    // Each step is closer to the dock than the one before, so the order held
    const toDock = walked.map(([lat, lng]) => Math.hypot(lat - 33.7857, lng + 84.3741));
    toDock.slice(1).forEach((d, i) => assert.ok(d < toDock[i], `step ${i + 2} is closer than step ${i + 1}`));
    // And the walk reached the middle on its way, not just the ends
    assert.ok(walked.some(([lat]) => lat > 33.7836 && lat < 33.7857));
  });

  it('sends no further position once the session stops mid-walk', async (t) => {
    demoFriends.timing.walkMs = 200;
    // Counts the demo friends' requests that have started but not finished
    let inFlight = 0;
    t.mock.method(globalThis, 'fetch', async (...args) => {
      inFlight += 1;
      try {
        return await realFetch(...args);
      } finally {
        inFlight -= 1;
      }
    });
    const world = await makeWorld();
    const seen = recordJordan(t, world);
    await subscribe(await logIn(world.person), world.picnic.toString());
    // The first beat's jump, then two steps of beat 4's walk
    await until(() => seen.length >= 3, 'the walk to be under way');
    await api().post('/api/auth/logout').set('Authorization', `Bearer ${world.person.token}`).expect(204);
    assert.equal(demoFriends.running(world.john._id), false);

    // A request the server had already received may still finish (the
    // guarantee allows it), so count from when none is left. This covers the
    // overall guarantee, that a stopped session starts no request, rather
    // than one particular wait: a step is due every 200 ms, and none comes
    // in the next 400 ms (two walk intervals).
    await until(() => inFlight === 0, 'the last request to finish');
    const soFar = seen.length;
    const deadline = Date.now() + 2 * demoFriends.timing.walkMs;
    while (Date.now() < deadline) {
      assert.equal(seen.length, soFar);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(seen.length, soFar);
  });

  it("starts each walk from where the friend really is, even if the meetup point moved in between", async (t) => {
    // Beats 4 to 7 wait long enough for the meetup point to be set between them
    Object.assign(demoFriends.timing, { minMs: 300, maxMs: 300 });
    const world = await makeWorld();
    const seen = recordJordan(t, world);
    await subscribe(await logIn(world.person), world.picnic.toString());
    // The first beat's jump, then all ten steps of beat 4's walk
    await until(() => seen.length >= 11, "Jordan's first walk to end");
    await api().put(`/api/events/${world.picnic}/live/meetup`)
      .set('Authorization', `Bearer ${world.person.token}`)
      .send({ lat: 33.8, lng: -84.4, note: 'Moved' })
      .expect(200);
    await finished(world);

    // Beat 7's first step is one small step on from where beat 4 left him
    // (a tenth of the way to the new point), not a jump from a halfway point
    // worked out for the new meetup point
    assert.equal(seen.length, 21);
    const [stopLat, stopLng] = seen[10];
    const [firstLat, firstLng] = seen[11];
    const step = Math.hypot(firstLat - stopLat, firstLng - stopLng);
    assert.ok(step < 0.003, `the first step was ${step} degrees`);
    assert.deepEqual(seen.at(-1), [33.8, -84.4]);
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

// Holds the result of the first beat claim (the database write itself goes
// through) until released
const holdFirstClaim = (t) => {
  const original = User.findOneAndUpdate;
  let release;
  let reached;
  const gate = new Promise((resolve) => { release = resolve; });
  const held = { reached: new Promise((resolve) => { reached = resolve; }), release: () => release() };
  let used = false;
  t.mock.method(User, 'findOneAndUpdate', function claim(...args) {
    const query = original.apply(this, args);
    if (used) return query;
    used = true;
    return query.exec().then((result) => {
      reached();
      return gate.then(() => result);
    });
  });
  return held;
};

const groupPhotos = async (world) =>
  (await Event.findById(world.picnic)).schedule.filter((item) => item.activity === 'Group photo').length;

describe('a claim that lands after its session stopped', () => {
  it('hands the beat back when nobody has claimed since', async (t) => {
    const world = await makeWorld();
    await User.updateOne({ _id: world.john._id }, { demoScriptStep: 4 });
    const held = holdFirstClaim(t);
    const ws = await logIn(world.person);
    await subscribe(ws, world.picnic.toString());
    await within(held.reached, 'the claim');
    assert.equal(await stepOf(world), 5);

    ws.terminate();
    await ended(world);
    held.release();
    await until(async () => (await stepOf(world)) === 4, 'the beat to be handed back');
  });

  it('never undoes a claim made by the session that replaced it', async (t) => {
    const world = await makeWorld();
    await User.updateOne({ _id: world.john._id }, { demoScriptStep: 4 });
    const held = holdFirstClaim(t);
    const handBack = t.mock.method(User, 'updateOne');
    const first = await logIn(world.person);
    await subscribe(first, world.picnic.toString());
    await within(held.reached, 'the claim');
    first.terminate();
    await ended(world);

    // A new session claims beat 5 and plays it, Taylor's Group photo
    const second = await logIn(world.person);
    await subscribe(second, world.picnic.toString());
    await until(async () => (await groupPhotos(world)) === 1, 'the replacement to plan the photo');
    held.release();
    await until(() => handBack.mock.callCount() > 0, 'the old session to try handing its beat back');

    await until(async () => (await stepOf(world)) === 7, 'the story to end');
    await finished(world);
    assert.equal(await groupPhotos(world), 1);
    assert.equal(await messagesIn(world, 'Found you all! 👋'), 1);
  });
});

describe('after the story is told', () => {
  const tell = async (world) => {
    const ws = await logIn(world.person);
    await subscribe(ws, world.picnic.toString());
    await finished(world);
    assert.equal(demoFriends.running(world.john._id), true);
    return ws;
  };
  const checkOften = () => { demoFriends.timing.toldCheckMs = 30; };

  it('tells a pruned and rebuilt world its story when John opens the picnic again', async () => {
    const world = await makeWorld();
    await tell(world);

    assert.equal(await pruneDemoWorlds({ maxAgeMs: -60000, maxWorlds: 10 }), 1);
    // His saved login rebuilds the same world, ids and all
    await api().get('/api/events').set('Authorization', `Bearer ${world.person.token}`).expect(200);
    assert.equal(await stepOf(world), 0);

    // Only opening the picnic wakes the told session: its own check is a minute away
    const again = await logIn(world.person);
    await subscribe(again, world.picnic.toString());
    await until(async () => (await stepOf(world)) === 7, 'the rebuilt world to hear its story');
    await finished(world);
    assert.equal(await Expense.countDocuments({ event: world.picnic, description: 'Ice cream' }), 1);
    assert.equal(await messagesIn(world, 'Found you all! 👋'), 1);
  });

  it('ends when Taylor deletes the picnic', async () => {
    checkOften();
    const world = await makeWorld();
    await tell(world);
    await api().delete(['/api/events', world.picnic].join('/')).set('Authorization', await world.tokenOf('Taylor')).expect(204);
    await ended(world);
  });

  it('ends when John settles up and leaves the picnic', async () => {
    checkOften();
    const world = await makeWorld();
    await tell(world);
    // After the ice cream John is owed $1.35; Alex pays it and John goes
    const auth = `Bearer ${world.person.token}`;
    const url = (...rest) => ['/api/events', world.picnic, ...rest].join('/');
    await api().post(url('payments')).set('Authorization', auth)
      .send({ from: world.id('Alex').toString(), to: world.john._id.toString(), amountCents: 135, date: '2030-01-01' })
      .expect(201);
    await api().delete(url('members', world.john._id.toString())).set('Authorization', auth).expect(204);
    await ended(world);
  });

  it('ends when the world is pruned', async () => {
    checkOften();
    const world = await makeWorld();
    await tell(world);
    assert.equal(await pruneDemoWorlds({ maxAgeMs: -60000, maxWorlds: 10 }), 1);
    await ended(world);
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
