const { useTestDatabase, api, registerUser, holdDemoBuilds } = require('./helpers');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { describe, it, before, after, afterEach } = require('node:test');
const { WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Event = require('../src/models/Event');
const demoData = require('../src/seed/demoData');
const realtime = require('../src/realtime/hub');

useTestDatabase();

const ORIGIN = 'http://localhost:3000';
// Long enough to cover a whole reconnect on a slow machine
const LEAVE_GRACE_MS = 500;
let server;
let url;
const sockets = [];

// A real server with the hub on it. Writes made through api() reach it too:
// the hub is one per process, whichever server took the request.
before(async () => {
  server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, resolve));
  realtime.attach(server, { origins: [ORIGIN], limits: { authMs: 300, leaveGraceMs: LEAVE_GRACE_MS } });
  url = `ws://localhost:${server.address().port}${realtime.PATH}`;
});

after(async () => {
  realtime.close();
  await new Promise((resolve) => server.close(resolve));
});

afterEach(() => {
  sockets.splice(0).forEach((ws) => ws.terminate());
});

const within = (promise, what, ms = 2000) => Promise.race([
  promise,
  new Promise((resolve, reject) => setTimeout(() => reject(new Error(`Timed out waiting for ${what}`)), ms))
]);

// A socket that keeps what it hears: next(match) waits for the next message
// that matches, and closed resolves with the close code
const connect = (options = {}) => new Promise((resolve, reject) => {
  const ws = new WebSocket(options.url || url, options.origin ? { origin: options.origin } : {});
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
  ws.closed = new Promise((done) => ws.on('close', (code, reason) => {
    ws.closeReason = reason.toString();
    done(code);
  }));
  ws.next = (match, what = 'a message') => {
    const index = inbox.findIndex(match);
    if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
    return within(new Promise((done) => waiters.push({ match, resolve: done })), what);
  };
  ws.on('open', () => resolve(ws));
  ws.on('unexpected-response', (req, res) => reject(Object.assign(new Error('Refused'), { status: res.statusCode })));
  ws.on('error', reject);
});

const logIn = async (person, options) => {
  const ws = await connect(options);
  ws.send(JSON.stringify({ type: 'auth', token: person.token }));
  await ws.next((m) => m.type === 'ready', 'ready');
  return ws;
};

const subscribe = async (ws, eventId) => {
  ws.send(JSON.stringify({ type: 'subscribe', eventId }));
  return ws.next((m) => m.eventId === eventId && ['subscribed', 'denied'].includes(m.type), 'an answer');
};

const poke = (eventId, what) => (m) => m.type === 'changed' && m.eventId === eventId && m.what === what;
const listChanged = (m) => m.type === 'changed' && m.what === 'events';

// A socket's messages arrive in order, so a poke sent after the action is a
// barrier: once it's here, any poke the action wrongly sent is here too
const assertHeardNothing = async (ws, person) => {
  realtime.notifyUsers([person.user._id]);
  await ws.next(listChanged, 'the barrier');
  assert.deepEqual(ws.inbox.filter((m) => m.type === 'changed'), []);
};

// The last pokes someone gets about an event as they lose it
const assertToldToReadEverything = async (ws, eventId) => {
  for (const what of ['event', 'live', 'chat']) await ws.next(poke(eventId, what), `the ${what} poke`);
};

const DAY = 24 * 60 * 60 * 1000;
const isoDay = (offset = 0) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const path = (event, ...rest) => ['/api/events', event._id, ...rest].join('/');

// An event happening now, its organizer, a friend who joined, and an outsider
const setup = async () => {
  const organizer = await registerUser();
  const friend = await registerUser();
  const outsider = await registerUser();
  const { body } = await api()
    .post('/api/events')
    .set('Authorization', organizer.auth)
    .send({ name: 'Weekend', startDate: isoDay(0), endDate: isoDay(1) })
    .expect(201);
  await api().post(`/api/invites/${body.event.inviteCode}/join`).set('Authorization', friend.auth).expect(200);
  return { organizer, friend, outsider, event: body.event };
};

describe('connecting', () => {
  it('closes a socket that never logs in', async () => {
    const ws = await connect();
    assert.equal(await within(ws.closed, 'the close'), realtime.ENDED);
  });

  it('closes a socket whose first message is not a login', async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ type: 'subscribe', eventId: '000000000000000000000000' }));
    assert.equal(await within(ws.closed, 'the close'), realtime.ENDED);
  });

  it('closes a socket with a bad token', async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ type: 'auth', token: 'not-a-token' }));
    assert.equal(await within(ws.closed, 'the close'), realtime.ENDED);
  });

  it('refuses a login that was logged out, and closes its open sockets', async () => {
    const person = await registerUser();
    const ws = await logIn(person);
    await api().post('/api/auth/logout').set('Authorization', person.auth).expect(204);
    assert.equal(await within(ws.closed, 'the close'), realtime.ENDED);

    const again = await connect();
    again.send(JSON.stringify({ type: 'auth', token: person.token }));
    assert.equal(await within(again.closed, 'the close'), realtime.ENDED);
  });

  it('closes sockets on a password change, and takes the new token', async () => {
    const person = await registerUser();
    const ws = await logIn(person);
    const { body } = await api().post('/api/auth/password').set('Authorization', person.auth)
      .send({ currentPassword: 'secret123', newPassword: 'a-new-long-passphrase' }).expect(200);
    assert.equal(await within(ws.closed, 'the close'), realtime.ENDED);
    await logIn({ token: body.token });
  });

  it('refuses pages from other sites, and takes the web app and native apps', async () => {
    await assert.rejects(connect({ origin: 'https://evil.example' }), { status: 403 });
    const person = await registerUser();
    await logIn(person, { origin: ORIGIN });
    await logIn(person);
  });

  it('only answers at its own address', async () => {
    await assert.rejects(connect({ url: url.replace('/api/socket', '/api/other') }));
  });

  it("survives an address it can't read", async () => {
    // Node accepts this request line, but it isn't a URL; parsing it must not
    // throw outside Express, which would end the process
    const socket = net.connect(server.address().port, 'localhost');
    socket.on('error', () => {});
    socket.write('GET http://[ HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
      + 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
    await within(new Promise((resolve) => socket.on('close', resolve)), 'the refusal');
    await logIn(await registerUser());
  });

  it('closes a socket that keeps asking for events it may not see', async () => {
    const person = await registerUser();
    const ws = await logIn(person);
    for (let i = 0; i < 21; i += 1) ws.send(JSON.stringify({ type: 'subscribe', eventId: 'nonsense' }));
    assert.equal(await within(ws.closed, 'the close'), 1008);
  });

  it('closes the oldest socket when one person opens a sixth', async () => {
    const person = await registerUser();
    const first = await logIn(person);
    for (let i = 0; i < 5; i += 1) await logIn(person);
    assert.equal(await within(first.closed, 'the close'), realtime.REPLACED);
  });

  it('closes a socket that sends an oversized message', async () => {
    const person = await registerUser();
    const ws = await logIn(person);
    ws.send(JSON.stringify({ type: 'subscribe', eventId: 'x'.repeat(2000) }));
    assert.equal(await within(ws.closed, 'the close'), 1009);
  });

  it('ignores messages it does not know', async () => {
    const { friend, event } = await setup();
    const ws = await logIn(friend);
    ws.send('not json');
    ws.send(JSON.stringify({ type: 'dance' }));
    assert.equal((await subscribe(ws, event._id)).type, 'subscribed');
  });
});

describe('subscribing', () => {
  it("is refused for someone else's event, or one that doesn't exist", async () => {
    const { outsider, event } = await setup();
    const ws = await logIn(outsider);
    assert.equal((await subscribe(ws, event._id)).type, 'denied');
    assert.equal((await subscribe(ws, 'nonsense')).type, 'denied');
  });
});

describe('pokes', () => {
  it('tell members about a chat message, and nobody else', async () => {
    const { organizer, friend, outsider, event } = await setup();
    const member = await logIn(friend);
    await subscribe(member, event._id);
    const stranger = await logIn(outsider);
    await subscribe(stranger, event._id);

    await api().post(path(event, 'messages')).set('Authorization', organizer.auth).send({ text: 'Hi' }).expect(201);
    await member.next(poke(event._id, 'chat'), 'the chat poke');
    await assertHeardNothing(stranger, outsider);
  });

  it("don't go out for marking your own chat read, or a refused change", async () => {
    const { organizer, friend, event } = await setup();
    const ws = await logIn(friend);
    await subscribe(ws, event._id);
    await api().put(path(event, 'messages', 'read')).set('Authorization', organizer.auth)
      .send({ lastRead: '000000000000000000000000' }).expect(204);
    await api().post(path(event, 'messages')).set('Authorization', organizer.auth).send({ text: '' }).expect(400);
    await assertHeardNothing(ws, friend);
  });

  it('say what changed: the map, the plans, the money, the event', async () => {
    const { organizer, friend, event } = await setup();
    const ws = await logIn(friend);
    await subscribe(ws, event._id);
    const as = (req) => req.set('Authorization', organizer.auth);

    await as(api().put(path(event, 'live', 'share'))).send({ until: new Date(Date.now() + 3600000).toISOString() }).expect(200);
    await ws.next(poke(event._id, 'live'), 'the live poke');
    // Starting to share is in the event's activity too (see below)
    await ws.next(poke(event._id, 'event'), 'the sharing poke');

    await as(api().post(path(event, 'schedule'))).send({ date: isoDay(0), startTime: '10:00', activity: 'Brunch' }).expect(201);
    await ws.next(poke(event._id, 'event'), 'the schedule poke');

    await as(api().post(path(event, 'expenses'))).send({
      description: 'Dinner', amountCents: 6000, date: isoDay(0), paidBy: organizer.user._id, splitType: 'equal',
      shares: [{ user: organizer.user._id, amountCents: 3000 }, { user: friend.user._id, amountCents: 3000 }]
    }).expect(201);
    await ws.next(poke(event._id, 'event'), 'the expense poke');

    await as(api().patch(path(event))).send({ name: 'Long weekend' }).expect(200);
    await ws.next(poke(event._id, 'event'), 'the edit poke');
  });

  it('tell the map and the event about a meetup point, which is part of both', async () => {
    const { organizer, friend, event } = await setup();
    const ws = await logIn(friend);
    await subscribe(ws, event._id);
    await api().put(path(event, 'live', 'meetup')).set('Authorization', organizer.auth).send({ lat: 40.7, lng: -74 }).expect(200);
    await ws.next(poke(event._id, 'live'), 'the live poke');
    await ws.next(poke(event._id, 'event'), 'the event poke');
  });

  it('tell the event page someone started sharing, but not when they change until when', async () => {
    const { organizer, friend, event } = await setup();
    const ws = await logIn(friend);
    await subscribe(ws, event._id);
    const share = (hours) => api().put(path(event, 'live', 'share')).set('Authorization', organizer.auth)
      .send({ until: new Date(Date.now() + hours * 3600000).toISOString() }).expect(200);

    await share(1);
    await ws.next(poke(event._id, 'event'), 'the event poke');
    await ws.next(poke(event._id, 'live'), 'the live poke');
    await share(2);
    await ws.next(poke(event._id, 'live'), 'the live poke for the change');
    await assertHeardNothing(ws, friend);
  });

  it('tell the map about a stored position, but not one that was skipped', async () => {
    const { organizer, friend, event } = await setup();
    const { body } = await api().put(path(event, 'live', 'share')).set('Authorization', organizer.auth)
      .send({ until: new Date(Date.now() + 3600000).toISOString() }).expect(200);
    const ws = await logIn(friend);
    await subscribe(ws, event._id);
    const send = (seq, ageMs) => api().put(path(event, 'live', 'position')).set('Authorization', organizer.auth)
      .send({ lat: 40.7, lng: -74, shareId: body.sharing.id, seq, ageMs }).expect(204);

    await send(2, 0);
    await ws.next(poke(event._id, 'live'), 'the live poke');
    // Out of date, then too old: nothing was stored, so nothing to hear
    await send(2, 0);
    await send(1, 0);
    await send(3, 2 * 60 * 1000 + 1);
    await assertHeardNothing(ws, friend);
  });

  it('tell your events when your payment handles change', async () => {
    const { organizer, friend, event } = await setup();
    const ws = await logIn(organizer);
    await subscribe(ws, event._id);
    await api().patch('/api/auth/me').set('Authorization', friend.auth).send({ paymentHandles: { venmo: 'friend-pays' } }).expect(200);
    await ws.next(poke(event._id, 'event'), 'the event poke');
  });

  it('tell members someone joined, and the new member on their other devices', async () => {
    const { organizer, outsider, event } = await setup();
    const host = await logIn(organizer);
    await subscribe(host, event._id);
    const otherDevice = await logIn(outsider);

    await api().post(`/api/invites/${event.inviteCode}/join`).set('Authorization', outsider.auth).expect(200);
    await host.next(poke(event._id, 'event'), 'the join poke');
    await otherDevice.next(listChanged, 'the list poke');
  });

  it('stop for someone removed, who hears their list changed', async () => {
    const { organizer, friend, event } = await setup();
    const removed = await logIn(friend);
    await subscribe(removed, event._id);
    const host = await logIn(organizer);
    await subscribe(host, event._id);

    await api().delete(path(event, 'members', friend.user._id)).set('Authorization', organizer.auth).expect(204);
    // Their open screens read once more and find it gone
    await assertToldToReadEverything(removed, event._id);
    await removed.next(listChanged, 'the list poke');
    // The others see them leave the members and the map
    await host.next(poke(event._id, 'event'), 'the removal poke');
    await host.next(poke(event._id, 'live'), 'the map poke');

    await api().post(path(event, 'messages')).set('Authorization', organizer.auth).send({ text: 'Bye' }).expect(201);
    await assertHeardNothing(removed, friend);
    // And they can't simply ask again
    assert.equal((await subscribe(removed, event._id)).type, 'denied');
  });

  it('tell every member when an event is deleted, and then stop', async () => {
    const { organizer, friend, event } = await setup();
    const ws = await logIn(friend);
    await subscribe(ws, event._id);

    await api().delete(path(event)).set('Authorization', organizer.auth).expect(204);
    await assertToldToReadEverything(ws, event._id);
    await ws.next(listChanged, 'the list poke');
    realtime.notifyEvent(event._id, 'chat');
    await assertHeardNothing(ws, friend);
  });
});

const presence = (eventId) => (m) => m.type === 'presence' && m.eventId === eventId;
const here = (message) => [...message.userIds].sort();
const ids = (...people) => people.map((p) => p.user._id).sort();

describe('presence', () => {

  it('tells a new subscriber which members have the app open, and not outsiders', async () => {
    const { organizer, friend, outsider, event } = await setup();
    await logIn(friend);
    await logIn(outsider);
    const ws = await logIn(organizer);
    await subscribe(ws, event._id);
    assert.deepEqual(here(await ws.next(presence(event._id), 'presence')), ids(organizer, friend));
  });

  it('tells members when someone opens the app, and never tells outsiders', async () => {
    const { organizer, friend, outsider, event } = await setup();
    const ws = await logIn(organizer);
    await subscribe(ws, event._id);
    await ws.next(presence(event._id), 'the first presence');
    const stranger = await logIn(outsider);
    await subscribe(stranger, event._id);

    await logIn(friend);
    assert.deepEqual(here(await ws.next(presence(event._id), 'presence')), ids(organizer, friend));
    // Anything sent to the stranger would have arrived before this
    realtime.notifyUsers([outsider.user._id]);
    await stranger.next(listChanged, 'the barrier');
    assert.equal(stranger.inbox.some((m) => m.type === 'presence'), false);
  });

  it('lets them go a moment after they close the app, unless they come straight back', async () => {
    const { organizer, friend, event } = await setup();
    const ws = await logIn(organizer);
    await subscribe(ws, event._id);
    const first = await logIn(friend);
    const second = await logIn(friend);
    await ws.next((m) => m.type === 'presence' && m.userIds.length === 2, 'both here');
    ws.inbox.length = 0;

    // One of two sockets closing changes nothing; the other closing starts
    // the grace, and a reconnect within it means they never left
    first.close();
    await first.closed;
    second.close();
    await second.closed;
    const again = await logIn(friend);
    await new Promise((resolve) => setTimeout(resolve, LEAVE_GRACE_MS + 100));
    assert.equal(ws.inbox.some((m) => m.type === 'presence'), false);

    again.close();
    assert.deepEqual(here(await ws.next(presence(event._id), 'the leave')), ids(organizer));
  });

  it('follows people joining and being removed', async () => {
    const { organizer, friend, outsider, event } = await setup();
    const ws = await logIn(organizer);
    await subscribe(ws, event._id);
    const removed = await logIn(friend);
    await subscribe(removed, event._id);
    await ws.next((m) => m.type === 'presence' && m.userIds.length === 2, 'the friend arriving');
    await logIn(outsider);

    await api().post(`/api/invites/${event.inviteCode}/join`).set('Authorization', outsider.auth).expect(200);
    const joined = await ws.next((m) => m.type === 'presence' && m.userIds.length === 3, 'the join');
    assert.deepEqual(here(joined), ids(organizer, friend, outsider));

    removed.inbox.length = 0;
    await api().delete(path(event, 'members', friend.user._id)).set('Authorization', organizer.auth).expect(204);
    const left = await ws.next((m) => m.type === 'presence' && m.userIds.length === 2, 'the removal');
    assert.deepEqual(here(left), ids(organizer, outsider));
    // Their list poke comes after any presence would have, and none did
    await removed.next(listChanged, 'the list poke');
    assert.equal(removed.inbox.some((m) => m.type === 'presence'), false);
  });

  it('lets someone go at once when they log out', async () => {
    const { organizer, friend, event } = await setup();
    const ws = await logIn(organizer);
    await subscribe(ws, event._id);
    await logIn(friend);
    await ws.next((m) => m.type === 'presence' && m.userIds.length === 2, 'both here');

    const loggedOutAt = Date.now();
    await api().post('/api/auth/logout').set('Authorization', friend.auth).expect(204);
    assert.deepEqual(here(await ws.next(presence(event._id), 'the leave')), ids(organizer));
    assert.ok(Date.now() - loggedOutAt < LEAVE_GRACE_MS, 'without waiting out the grace');
  });

  it("doesn't let someone go when a sixth socket replaces their oldest", async () => {
    const { organizer, friend, event } = await setup();
    const ws = await logIn(organizer);
    await subscribe(ws, event._id);
    for (let i = 0; i < 5; i += 1) await logIn(friend);
    await ws.next((m) => m.type === 'presence' && m.userIds.length === 2, 'both here');
    ws.inbox.length = 0;

    await logIn(friend);
    await new Promise((resolve) => setTimeout(resolve, LEAVE_GRACE_MS + 100));
    assert.equal(ws.inbox.some((m) => m.type === 'presence'), false);
  });
});

describe('a login running out', () => {
  // A real token for this person, signed like the API's own (tests/env.js
  // sets the secret). exp counts whole seconds, so +2 leaves one to two
  // seconds: enough to log in and subscribe on a slow machine.
  const shortLived = (person) =>
    jwt.sign({ sub: person.user._id, sv: 0, exp: Math.floor(Date.now() / 1000) + 2 }, 'test-secret', { algorithm: 'HS256' });

  it('closes the socket when its token expires, and lets them go at once', async () => {
    const { organizer, friend, event } = await setup();
    const ws = await logIn(organizer);
    await subscribe(ws, event._id);
    const expiring = await logIn({ token: shortLived(friend) });
    await subscribe(expiring, event._id);
    await ws.next((m) => m.type === 'presence' && m.userIds.length === 2, 'both here');

    assert.equal(await within(expiring.closed, 'the close', 4000), realtime.ENDED);
    const closedAt = Date.now();
    assert.deepEqual(here(await ws.next((m) => m.type === 'presence' && m.userIds.length === 1, 'the leave')), ids(organizer));
    assert.ok(Date.now() - closedAt < LEAVE_GRACE_MS, 'without waiting out the grace');
  });

  it('leaves their other, newer logins alone', async () => {
    const { organizer, friend, event } = await setup();
    const ws = await logIn(organizer);
    await subscribe(ws, event._id);
    const expiring = await logIn({ token: shortLived(friend) });
    const current = await logIn(friend);
    await subscribe(current, event._id);
    await ws.next((m) => m.type === 'presence' && m.userIds.length === 2, 'both here');
    ws.inbox.length = 0;

    assert.equal(await within(expiring.closed, 'the close', 4000), realtime.ENDED);
    await api().post(path(event, 'messages')).set('Authorization', organizer.auth).send({ text: 'Still here?' }).expect(201);
    await current.next(poke(event._id, 'chat'), 'the chat poke');
    assert.equal(ws.inbox.some((m) => m.type === 'presence'), false);
  });
});

describe('a login that finds the demo busy', () => {
  it('is told to come back later, not that it ended', async (t) => {
    // A saved demo login whose world is gone, so logging in must rebuild it
    const { body } = await api().post('/api/auth/demo').send({}).expect(201);
    await demoData.pruneDemoWorlds({ maxAgeMs: -1, maxWorlds: 100 });
    const builds = holdDemoBuilds(t);
    const filling = [1, 2, 3, 4, 5].map(() => api().post('/api/auth/demo').send({}).expect(201).then((res) => res));
    await builds.started(5);

    const ws = await connect();
    ws.send(JSON.stringify({ type: 'auth', token: body.token }));
    assert.equal(await within(ws.closed, 'the close'), realtime.TRY_LATER);

    builds.release();
    await Promise.all(filling);
    // The login was never in doubt: once there's room it gets in
    await logIn(body);
  });
});

describe('a socket that sends a lot of messages', () => {
  const MANY = 20;
  const eventsFor = async (organizer, count) => {
    const events = [];
    for (let i = 0; i < count; i += 1) {
      const { body } = await api()
        .post('/api/events')
        .set('Authorization', organizer.auth)
        .send({ name: `Plan ${i}`, startDate: isoDay(0), endDate: isoDay(1) })
        .expect(201);
      events.push(body.event);
    }
    return events;
  };
  const send = (ws, messages) => messages.forEach((message) => ws.send(JSON.stringify(message)));

  it('is served a full burst at the real limit, and the count drains as it is answered', async () => {
    const organizer = await registerUser();
    const events = await eventsFor(organizer, MANY);
    const subscribes = events.map((e) => ({ type: 'subscribe', eventId: e._id }));
    const unsubscribes = events.map((e) => ({ type: 'unsubscribe', eventId: e._id }));
    // The last subscribe is answered only once everything before it was handled
    const last = { type: 'subscribe', eventId: events[0]._id };

    const ws = await connect();
    // A login, 20 subscribes and 20 unsubscribes at once: 41 of the 50 allowed
    send(ws, [{ type: 'auth', token: organizer.token }, ...subscribes, ...unsubscribes, last]);
    const answers = async () => {
      for (let i = 0; i < MANY + 1; i += 1) await ws.next((m) => m.type === 'subscribed', 'an answer');
    };
    await ws.next((m) => m.type === 'ready', 'ready');
    await within(answers(), 'the first burst');

    // 83 messages over the socket's life, so the count must have gone back down
    send(ws, [...subscribes, ...unsubscribes, last]);
    await within(answers(), 'the second burst');
    assert.equal(ws.readyState, WebSocket.OPEN);
  });

  describe('past the limit', () => {
    before(() => {
      realtime.close();
      realtime.attach(server, { origins: [ORIGIN], limits: { authMs: 300, leaveGraceMs: LEAVE_GRACE_MS, queuedMessages: 5 } });
    });
    after(() => {
      realtime.close();
      realtime.attach(server, { origins: [ORIGIN], limits: { authMs: 300, leaveGraceMs: LEAVE_GRACE_MS } });
    });

    it('is closed while its login is still being checked, and nothing it queued takes effect', async (t) => {
      const { organizer, friend, event } = await setup();
      // Only the flooding member's login lookup is held up; everyone else's
      // goes straight through
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const findById = User.findById.bind(User);
      let heldLookups = 0;
      let lookupStarted;
      const started = new Promise((resolve) => { lookupStarted = resolve; });
      t.mock.method(User, 'findById', (id, ...rest) => {
        if (String(id) !== friend.user._id) return findById(id, ...rest);
        heldLookups += 1;
        lookupStarted();
        return gate.then(() => findById(id, ...rest));
      });
      const findOne = Event.findOne.bind(Event);
      const eventChecks = t.mock.method(Event, 'findOne', (...args) => findOne(...args));
      const finds = [];
      const find = Event.find.bind(Event);
      t.mock.method(Event, 'find', (...args) => {
        const found = Promise.resolve(find(...args));
        finds.push(found);
        return found;
      });

      const flooder = await connect();
      send(flooder, [{ type: 'auth', token: friend.token }]);
      await within(started, 'the login lookup');
      // The login is now waiting on the database; these queue up behind it
      send(flooder, Array.from({ length: MANY }, () => ({ type: 'subscribe', eventId: event._id })));
      assert.equal(await within(flooder.closed, 'the close'), 1008);
      assert.equal(flooder.closeReason, 'Too many messages.');

      // Others are served as normal while that login is still unanswered
      const ws = await logIn(organizer);
      assert.equal((await subscribe(ws, event._id)).type, 'subscribed');
      assert.equal(heldLookups, 1);
      const checksWhileHeld = eventChecks.mock.callCount();

      const findsBefore = finds.length;
      release();
      await within((async () => { while (finds.length === findsBefore) await new Promise((r) => setImmediate(r)); })(), 'the login to finish');
      await finds[findsBefore];

      // Nothing the closed socket queued ran, and it wasn't counted as here
      assert.equal(eventChecks.mock.callCount(), checksWhileHeld);
      realtime.notifyUsers([organizer.user._id]);
      await ws.next(listChanged, 'the barrier');
      assert.equal(ws.inbox.some((m) => m.type === 'presence' && m.userIds.includes(friend.user._id)), false);
      assert.equal(ws.inbox.some((m) => m.type === 'subscribed'), false);
    });

    it('runs nothing it had queued once it is closed, even after logging in', async (t) => {
      const { friend, event } = await setup();
      const flooder = await logIn(friend);
      // The first subscribe's access check waits on the database; the rest
      // queue up behind it until the socket goes over the limit
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const findOne = Event.findOne.bind(Event);
      let held = false;
      let checkStarted;
      const started = new Promise((resolve) => { checkStarted = resolve; });
      const checks = t.mock.method(Event, 'findOne', (...args) => {
        if (held) return findOne(...args);
        held = true;
        checkStarted();
        return gate.then(() => findOne(...args));
      });
      send(flooder, [{ type: 'subscribe', eventId: event._id }]);
      await within(started, 'the first access check');
      send(flooder, Array.from({ length: MANY }, () => ({ type: 'subscribe', eventId: event._id })));
      assert.equal(await within(flooder.closed, 'the close'), 1008);
      assert.equal(checks.mock.callCount(), 1);

      // Once the held check answers, the queued subscribes come up one by one,
      // but the socket is closed, so none of them asks the database anything
      release();
      for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
      assert.equal(checks.mock.callCount(), 1);
    });
  });
});
