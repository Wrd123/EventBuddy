const { useTestDatabase, api, registerUser } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const Message = require('../src/models/Message');
const ChatRead = require('../src/models/ChatRead');
const { seedDemoData } = require('../src/seed/demoData');

useTestDatabase();

// An event with its organizer and one friend who joined by invite
const setup = async (name = 'Friendsgiving') => {
  const organizer = await registerUser();
  const friend = await registerUser();
  const res = await api()
    .post('/api/events')
    .set('Authorization', organizer.auth)
    .send({ name, startDate: '2099-11-25', endDate: '2099-11-27' })
    .expect(201);
  const event = res.body.event;
  await api().post(`/api/invites/${event.inviteCode}/join`).set('Authorization', friend.auth).expect(200);
  return { organizer, friend, event };
};

const messagesPath = (event) => `/api/events/${event._id}/messages`;

const send = (auth, event, text, status = 201) =>
  api().post(messagesPath(event)).set('Authorization', auth).send({ text }).expect(status);

const list = (auth, event, query = {}, status = 200) =>
  api().get(messagesPath(event)).query(query).set('Authorization', auth).expect(status);

const markRead = (auth, event, lastRead, status = 204) =>
  api().put(`${messagesPath(event)}/read`).set('Authorization', auth).send({ lastRead }).expect(status);

const chats = async (auth) => (await api().get('/api/chats').set('Authorization', auth).expect(200)).body.chats;

// Messages straight into the database, for paging tests
const insertMessages = (event, user, count) =>
  Message.insertMany(
    Array.from({ length: count }, (_, i) => ({
      event: event._id,
      sender: { user: user._id, name: user.name },
      text: `Message ${i + 1}`
    }))
  );

describe('POST /api/events/:id/messages', () => {
  it("posts a message with the sender's name", async () => {
    const { friend, event } = await setup();

    const res = await send(friend.auth, event, '  On my way!  ');

    assert.equal(res.body.message.text, 'On my way!');
    assert.deepEqual(res.body.message.sender, { user: friend.user._id, name: friend.user.name });
    assert.ok(res.body.message.createdAt);
  });

  it('rejects empty and overly long messages', async () => {
    const { organizer, event } = await setup();

    const empty = await send(organizer.auth, event, '   ', 400);
    assert.equal(empty.body.message, 'Write a message first.');
    const long = await send(organizer.auth, event, 'x'.repeat(1001), 400);
    assert.equal(long.body.message, 'Messages can be up to 1000 characters.');
    await send(organizer.auth, event, 'x'.repeat(1000));
  });

  it("can't post to an event you're not in", async () => {
    const { event } = await setup();
    const stranger = await registerUser();

    await send(stranger.auth, event, 'Hi', 404);
    assert.equal(await Message.countDocuments(), 0);
  });

  it('needs a login', async () => {
    const { event } = await setup();
    await api().post(messagesPath(event)).send({ text: 'Hi' }).expect(401);
  });
});

describe('sending with a clientId', () => {
  const sendWithId = (auth, event, text, clientId) =>
    api().post(messagesPath(event)).set('Authorization', auth).send({ text, clientId });

  it('saves a retried send once and returns the saved message', async () => {
    const { friend, event } = await setup();
    const first = await sendWithId(friend.auth, event, 'On my way', 'send-1').expect(201);
    // The response was lost, so the app sends it again with the same id
    const again = await sendWithId(friend.auth, event, 'On my way', 'send-1').expect(200);

    assert.equal(again.body.message._id, first.body.message._id);
    assert.equal(await Message.countDocuments(), 1);
  });

  it('saves one message when a retry races the original', async () => {
    const { friend, event } = await setup();
    const results = await Promise.all([
      sendWithId(friend.auth, event, 'On my way', 'send-1'),
      sendWithId(friend.auth, event, 'On my way', 'send-1')
    ]);

    assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
    assert.equal(await Message.countDocuments(), 1);
  });

  it('still posts the same text twice when it is sent twice on purpose', async () => {
    const { friend, event } = await setup();
    await sendWithId(friend.auth, event, 'Ha!', 'send-1').expect(201);
    await sendWithId(friend.auth, event, 'Ha!', 'send-2').expect(201);
    assert.equal(await Message.countDocuments(), 2);
  });

  it("keeps people's ids apart", async () => {
    const { organizer, friend, event } = await setup();
    await sendWithId(organizer.auth, event, 'Hi', 'send-1').expect(201);
    await sendWithId(friend.auth, event, 'Hi', 'send-1').expect(201);
    assert.equal(await Message.countDocuments(), 2);
  });

  it('rejects an id reused for different text', async () => {
    const { friend, event } = await setup();
    await sendWithId(friend.auth, event, 'On my way', 'send-1').expect(201);
    const res = await sendWithId(friend.auth, event, 'Running late', 'send-1').expect(409);
    assert.equal(res.body.message, 'That request was already used for something else.');
  });

  it('rejects a clientId that is blank, too long or not a plain id', async () => {
    const { friend, event } = await setup();
    for (const clientId of ['', 'x'.repeat(65), 'has spaces', { $gt: '' }]) {
      await sendWithId(friend.auth, event, 'Hi', clientId).expect(400);
    }
    assert.equal(await Message.countDocuments(), 0);
  });
});

describe('GET /api/events/:id/messages', () => {
  it('lists messages oldest first', async () => {
    const { organizer, friend, event } = await setup();
    await send(organizer.auth, event, 'Who is driving?');
    await send(friend.auth, event, 'I can!');

    const res = await list(friend.auth, event);

    assert.deepEqual(res.body.messages.map((m) => m.text), ['Who is driving?', 'I can!']);
    assert.equal(res.body.hasMore, false);
  });

  it('returns only newer messages after a cursor, for polling', async () => {
    const { organizer, friend, event } = await setup();
    const first = (await send(organizer.auth, event, 'One')).body.message;
    await send(friend.auth, event, 'Two');
    await send(organizer.auth, event, 'Three');

    const res = await list(friend.auth, event, { after: first._id });
    assert.deepEqual(res.body.messages.map((m) => m.text), ['Two', 'Three']);

    const latest = res.body.messages.at(-1)._id;
    assert.deepEqual((await list(friend.auth, event, { after: latest })).body.messages, []);
  });

  it('pages back through history 50 at a time', async () => {
    const { organizer, event } = await setup();
    await insertMessages(event, organizer.user, 120);

    const page1 = (await list(organizer.auth, event)).body;
    assert.equal(page1.messages.length, 50);
    assert.equal(page1.messages[0].text, 'Message 71');
    assert.equal(page1.messages.at(-1).text, 'Message 120');
    assert.equal(page1.hasMore, true);

    const page2 = (await list(organizer.auth, event, { before: page1.messages[0]._id })).body;
    assert.equal(page2.messages[0].text, 'Message 21');
    assert.equal(page2.hasMore, true);

    const page3 = (await list(organizer.auth, event, { before: page2.messages[0]._id })).body;
    assert.deepEqual([page3.messages[0].text, page3.messages.length, page3.hasMore], ['Message 1', 20, false]);
  });

  it('rejects a cursor that is not a message id', async () => {
    const { organizer, event } = await setup();
    const res = await list(organizer.auth, event, { after: 'yesterday' }, 400);
    assert.equal(res.body.message, 'Invalid message id.');
    await list(organizer.auth, event, { before: '{"$gt":""}' }, 400);
  });

  it("hides the chat of an event you're not in", async () => {
    const { organizer, event } = await setup();
    await send(organizer.auth, event, 'Secret plans');
    const stranger = await registerUser();

    await list(stranger.auth, event, {}, 404);
  });

  it("keeps each event's chat separate", async () => {
    const a = await setup('Trip A');
    const b = await setup('Trip B');
    await send(a.organizer.auth, a.event, 'Only in A');

    assert.deepEqual((await list(b.organizer.auth, b.event)).body.messages, []);
  });
});

describe('GET /api/chats', () => {
  it('lists a chat for each of your events, with the latest message', async () => {
    const { organizer, friend, event } = await setup();
    await send(organizer.auth, event, 'First');
    await send(friend.auth, event, 'Bring snacks');

    const [chat] = await chats(organizer.auth);

    assert.equal(chat.eventId, event._id);
    assert.equal(chat.name, 'Friendsgiving');
    assert.equal(chat.memberCount, 2);
    assert.equal(chat.lastMessage.text, 'Bring snacks');
    assert.deepEqual(chat.lastMessage.sender, { user: friend.user._id, name: friend.user.name });
  });

  it('counts messages from others since you last read', async () => {
    const { organizer, friend, event } = await setup();
    await send(organizer.auth, event, 'Mine never count');
    const seen = (await send(friend.auth, event, 'Seen')).body.message;
    await send(friend.auth, event, 'New one');
    await send(friend.auth, event, 'Another');

    assert.equal((await chats(organizer.auth))[0].unread, 3);
    await markRead(organizer.auth, event, seen._id);
    assert.equal((await chats(organizer.auth))[0].unread, 2);
    // For the friend, only the organizer's message is new
    assert.equal((await chats(friend.auth))[0].unread, 1);
  });

  it('never moves the read point backwards', async () => {
    const { organizer, friend, event } = await setup();
    const first = (await send(friend.auth, event, 'One')).body.message;
    const second = (await send(friend.auth, event, 'Two')).body.message;

    await markRead(organizer.auth, event, second._id);
    await markRead(organizer.auth, event, first._id);

    assert.equal((await chats(organizer.auth))[0].unread, 0);
    assert.equal(await ChatRead.countDocuments(), 1);
  });

  it('puts the chat with the newest activity first', async () => {
    const quiet = await setup('Quiet trip');
    const busy = await setup('Busy trip');
    const third = await setup('Newest event');
    // One person in all three events
    for (const { event } of [quiet, busy]) {
      await api().post(`/api/invites/${event.inviteCode}/join`).set('Authorization', third.organizer.auth).expect(200);
    }
    await send(busy.organizer.auth, busy.event, 'Just now');

    const names = (await chats(third.organizer.auth)).map((c) => c.name);
    assert.deepEqual(names, ['Busy trip', 'Newest event', 'Quiet trip']);
    const quietChat = (await chats(third.organizer.auth)).find((c) => c.name === 'Quiet trip');
    assert.deepEqual([quietChat.lastMessage, quietChat.unread], [null, 0]);
  });

  it("leaves out events you're not in", async () => {
    const { organizer, event } = await setup();
    await send(organizer.auth, event, 'Hi');
    const stranger = await registerUser();

    assert.deepEqual(await chats(stranger.auth), []);
  });

  it('rejects marking read with a bad id', async () => {
    const { organizer, event } = await setup();
    await markRead(organizer.auth, event, 'latest', 400);
  });
});

describe('deleting an event', () => {
  it('deletes its chat too', async () => {
    const { organizer, friend, event } = await setup();
    const message = (await send(friend.auth, event, 'Bye')).body.message;
    await markRead(organizer.auth, event, message._id);

    await api().delete(`/api/events/${event._id}`).set('Authorization', organizer.auth).expect(204);

    assert.equal(await Message.countDocuments(), 0);
    assert.equal(await ChatRead.countDocuments(), 0);
  });
});

describe('demo chat', () => {
  it('seeds a festival chat with two unread messages', async () => {
    await seedDemoData();
    const login = await api().post('/api/auth/login').send({ email: 'user@example.com', password: 'password' }).expect(200);
    const auth = `Bearer ${login.body.token}`;

    const festival = (await chats(auth)).find((c) => c.name === 'Summer Music Festival');
    assert.equal(festival.unread, 2);
    assert.equal(festival.lastMessage.sender.name, 'Jamie');

    const res = await api().get(`/api/events/${festival.eventId}/messages`).set('Authorization', auth).expect(200);
    assert.equal(res.body.messages.length, 6);
    // Sorted by id, which follows the send times
    const times = res.body.messages.map((m) => new Date(m.createdAt).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });
});
