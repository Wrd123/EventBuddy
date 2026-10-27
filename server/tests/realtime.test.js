const { useTestDatabase, api, registerUser } = require('./helpers');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { describe, it, before, after, afterEach } = require('node:test');
const { WebSocket } = require('ws');
const { createApp } = require('../src/app');
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
  ws.closed = new Promise((done) => ws.on('close', (code) => done(code)));
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

describe('presence', () => {
  const presence = (eventId) => (m) => m.type === 'presence' && m.eventId === eventId;
  const here = (message) => [...message.userIds].sort();
  const ids = (...people) => people.map((p) => p.user._id).sort();

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
