const { useTestDatabase, api, registerUser } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const Event = require('../src/models/Event');
const LocationShare = require('../src/models/LocationShare');
const { isHappening } = require('../src/routes/live');
const { seedDemoData, dayIn, DEMO_EVENT_IDS } = require('../src/seed/demoData');
const Expense = require('../src/models/Expense');
const { validateScheduleItem, validateExpense } = require('../src/validation');

useTestDatabase();

const HOUR = 60 * 60 * 1000;
const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 24 * HOUR).toISOString().slice(0, 10);
const inHours = (hours) => new Date(Date.now() + hours * HOUR).toISOString();

// An event happening today with its organizer and a friend who joined
const setup = async ({ startDate = isoDay(), endDate = startDate } = {}) => {
  const organizer = await registerUser();
  const friend = await registerUser();
  const created = await api()
    .post('/api/events')
    .set('Authorization', organizer.auth)
    .send({ name: 'Picnic', startDate: isoDay(), endDate: isoDay(), location: 'Piedmont Park' })
    .expect(201);
  // Past or future dates can't be created through the API, so set them directly
  await Event.updateOne({ _id: created.body.event._id }, { startDate, endDate });
  const event = created.body.event;
  await api().post(`/api/invites/${event.inviteCode}/join`).set('Authorization', friend.auth).expect(200);
  return { organizer, friend, event };
};

const live = (event) => `/api/events/${event._id}/live`;

const startSharing = (auth, event, until = inHours(1), status = 200) =>
  api().put(`${live(event)}/share`).set('Authorization', auth).send({ until }).expect(status);

const sendPosition = (auth, event, position, status = 204) =>
  api().put(`${live(event)}/position`).set('Authorization', auth).send(position).expect(status);

const getLive = async (auth, event) => (await api().get(live(event)).set('Authorization', auth).expect(200)).body;

describe('sharing your location', () => {
  it('shows friends where you are once you share', async () => {
    const { organizer, friend, event } = await setup();

    const res = await startSharing(friend.auth, event);
    assert.ok(res.body.sharing.until);
    await sendPosition(friend.auth, event, { lat: 33.785123456, lng: -84.373812345, accuracy: 12.4 });

    const view = await getLive(organizer.auth, event);
    assert.equal(view.sharing, null);
    assert.equal(view.people.length, 1);
    const [person] = view.people;
    assert.equal(person.user, friend.user._id);
    assert.equal(person.name, friend.user.name);
    assert.match(person.color, /^#[0-9a-f]{6}$/i);
    assert.deepEqual([person.lat, person.lng, person.accuracy], [33.78512, -84.37381, 12]);
    assert.ok(person.positionAt);
  });

  it("doesn't list you to yourself, but says you're sharing", async () => {
    const { friend, event } = await setup();
    await startSharing(friend.auth, event);
    await sendPosition(friend.auth, event, { lat: 33.78, lng: -84.37 });

    const view = await getLive(friend.auth, event);
    assert.ok(view.sharing.until);
    assert.deepEqual(view.people, []);
  });

  it('leaves out people who are sharing but have no position yet', async () => {
    const { organizer, friend, event } = await setup();
    await startSharing(friend.auth, event);

    assert.deepEqual((await getLive(organizer.auth, event)).people, []);
  });

  it('keeps only the latest position', async () => {
    const { organizer, friend, event } = await setup();
    await startSharing(friend.auth, event);
    await sendPosition(friend.auth, event, { lat: 33.78, lng: -84.37 });
    await sendPosition(friend.auth, event, { lat: 33.79, lng: -84.38 });

    const [person] = (await getLive(organizer.auth, event)).people;
    assert.deepEqual([person.lat, person.lng], [33.79, -84.38]);
    assert.equal(await LocationShare.countDocuments(), 1);
  });

  it('stops when you stop sharing', async () => {
    const { organizer, friend, event } = await setup();
    await startSharing(friend.auth, event);
    await sendPosition(friend.auth, event, { lat: 33.78, lng: -84.37 });

    await api().delete(`${live(event)}/share`).set('Authorization', friend.auth).expect(204);

    assert.deepEqual((await getLive(organizer.auth, event)).people, []);
    assert.equal(await LocationShare.countDocuments(), 0);
    const late = await sendPosition(friend.auth, event, { lat: 33.78, lng: -84.37 }, 409);
    assert.equal(late.body.message, "You're not sharing your location right now.");
  });

  it('stops on its own when the time is up', async () => {
    const { organizer, friend, event } = await setup();
    await startSharing(friend.auth, event);
    await sendPosition(friend.auth, event, { lat: 33.78, lng: -84.37 });

    // As if the hour had passed (MongoDB removes it soon after, too)
    await LocationShare.updateOne({}, { until: new Date(Date.now() - 1000) });

    assert.deepEqual((await getLive(organizer.auth, event)).people, []);
    assert.equal((await getLive(friend.auth, event)).sharing, null);
    await sendPosition(friend.auth, event, { lat: 33.78, lng: -84.37 }, 409);
  });

  it('lets you change how long you share', async () => {
    const { friend, event } = await setup();
    await startSharing(friend.auth, event, inHours(1));
    const later = inHours(3);
    await startSharing(friend.auth, event, later);

    assert.equal((await getLive(friend.auth, event)).sharing.until, later);
    assert.equal(await LocationShare.countDocuments(), 1);
  });

  it('needs a time up to 24 hours ahead', async () => {
    const { friend, event } = await setup();

    assert.equal((await startSharing(friend.auth, event, 'soon', 400)).body.message, 'Choose how long to share.');
    await startSharing(friend.auth, event, inHours(-1), 400);
    const long = await startSharing(friend.auth, event, inHours(25), 400);
    assert.equal(long.body.message, 'You can share for up to 24 hours at a time.');
    await startSharing(friend.auth, event, inHours(24));
  });

  it('only while the event is happening', async () => {
    const { friend, event } = await setup({ startDate: isoDay(10), endDate: isoDay(12) });

    const res = await startSharing(friend.auth, event, inHours(1), 409);
    assert.equal(res.body.message, 'You can share your location while the event is happening.');
  });

  it('rejects positions that are not on the map', async () => {
    const { friend, event } = await setup();
    await startSharing(friend.auth, event);

    for (const position of [{ lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: '33.7', lng: -84 }, {}]) {
      const res = await sendPosition(friend.auth, event, position, 400);
      assert.equal(res.body.message, 'Invalid location.');
    }
  });

  it("is private to the event's members", async () => {
    const { friend, event } = await setup();
    await startSharing(friend.auth, event);
    await sendPosition(friend.auth, event, { lat: 33.78, lng: -84.37 });
    const stranger = await registerUser();

    await api().get(live(event)).set('Authorization', stranger.auth).expect(404);
    await startSharing(stranger.auth, event, inHours(1), 404);
    await api().get(live(event)).expect(401);
  });
});

describe('ordered positions', () => {
  // A share, and a helper that sends for it with the next sample number
  const sharingFriend = async () => {
    const world = await setup();
    const { body } = await startSharing(world.friend.auth, world.event);
    return { ...world, shareId: body.sharing.id };
  };
  const position = (shareId, seq, ageMs = 0, at = {}) => ({ lat: 33.78, lng: -84.37, shareId, seq, ageMs, ...at });
  const stored = () => LocationShare.findOne().lean();

  it('gives the share an id, which stays when you extend it', async () => {
    const { friend, event, shareId } = await sharingFriend();
    assert.match(shareId, /^[0-9a-f]{24}$/);

    const extended = await startSharing(friend.auth, event, inHours(3));
    assert.equal(extended.body.sharing.id, shareId);
    assert.equal((await stored())._id.toString(), shareId);
  });

  it('gives a new id when starting again after an expired share', async () => {
    const { friend, event, shareId } = await sharingFriend();
    await LocationShare.updateOne({}, { until: new Date(Date.now() - 1000) });

    const again = await startSharing(friend.auth, event);
    assert.notEqual(again.body.sharing.id, shareId);
    assert.equal(await LocationShare.countDocuments(), 1);
  });

  it('shows the ids in the live view', async () => {
    const { organizer, friend, event, shareId } = await sharingFriend();
    await sendPosition(friend.auth, event, position(shareId, 1));

    assert.equal((await getLive(friend.auth, event)).sharing.id, shareId);
    const [person] = (await getLive(organizer.auth, event)).people;
    // And how far the phone's count has got, for a phone that lost it
    await sendPosition(friend.auth, event, position(shareId, 7));
    assert.equal((await getLive(friend.auth, event)).sharing.seq, 7);
    assert.equal((await startSharing(friend.auth, event, inHours(3))).body.sharing.seq, 7);
    assert.equal(person.share, shareId);
  });

  it('measures the position when the phone did, not when it arrived', async () => {
    const { friend, event, shareId } = await sharingFriend();
    const before = Date.now();
    await sendPosition(friend.auth, event, position(shareId, 4, 5000));
    const after = Date.now();

    const share = await stored();
    assert.equal(share.seq, 4);
    assert.ok(share.positionAt.getTime() >= before - 5000 && share.positionAt.getTime() <= after - 5000);
    assert.ok(share.receivedAt.getTime() >= before && share.receivedAt.getTime() <= after);
  });

  it('ignores a fix that is not newer than the last', async () => {
    const { friend, event, shareId } = await sharingFriend();
    await sendPosition(friend.auth, event, position(shareId, 5, 0, { lat: 10, lng: 20 }));
    const first = await stored();

    await sendPosition(friend.auth, event, position(shareId, 5, 0, { lat: 11, lng: 21 }));
    await sendPosition(friend.auth, event, position(shareId, 3, 0, { lat: 12, lng: 22 }));

    const share = await stored();
    assert.deepEqual([share.lat, share.lng, share.seq], [10, 20, 5]);
    assert.deepEqual(share.positionAt, first.positionAt);

    await sendPosition(friend.auth, event, position(shareId, 6, 0, { lat: 13, lng: 23 }));
    assert.deepEqual([(await stored()).lat, (await stored()).seq], [13, 6]);
  });

  it("doesn't let a stopped share's late fix touch the new one", async () => {
    const { friend, event, shareId: oldId } = await sharingFriend();
    await api().delete(`${live(event)}/share`).set('Authorization', friend.auth).expect(204);
    const { body } = await startSharing(friend.auth, event);

    const late = await sendPosition(friend.auth, event, position(oldId, 9), 409);
    assert.equal(late.body.message, "You're not sharing your location right now.");
    const share = await stored();
    assert.equal(share._id.toString(), body.sharing.id);
    assert.equal(share.lat, null);
    assert.equal(share.seq, null);
  });

  it('ignores a fix that is too old to show', async () => {
    const { friend, event, shareId } = await sharingFriend();

    await sendPosition(friend.auth, event, position(shareId, 1, 2 * 60 * 1000 + 1));
    assert.equal((await stored()).lat, null);
    await sendPosition(friend.auth, event, position(shareId, 1, 2 * 60 * 1000));
    assert.equal((await stored()).seq, 1);
  });

  it('refuses fields that are partial or invalid', async () => {
    const { friend, event, shareId } = await sharingFriend();
    const base = { lat: 33.78, lng: -84.37 };
    const bad = [
      { ...base, shareId },
      { ...base, seq: 1 },
      { ...base, ageMs: 0 },
      { ...base, shareId, seq: 1 },
      { ...base, seq: 1, ageMs: 0 },
      position('not-an-id', 1),
      position(null, 1),
      position(shareId, 0),
      position(shareId, -1),
      position(shareId, 1.5),
      position(shareId, '2'),
      position(shareId, Number.MAX_SAFE_INTEGER + 1),
      position(shareId, 1, -1),
      position(shareId, 1, '5'),
      position(shareId, 1, null),
      // JSON has no NaN; this is what one turns into
      position(shareId, 1, undefined, { ageMs: null })
    ];
    for (const body of bad) await sendPosition(friend.auth, event, body, 400);
    const nan = await api().put(`${live(event)}/position`).set('Authorization', friend.auth)
      .set('Content-Type', 'application/json').send('{"lat":1,"lng":1,"shareId":"' + shareId + '","seq":1,"ageMs":NaN}');
    assert.equal(nan.status, 400);
    assert.equal((await stored()).lat, null);
  });

  it('still takes positions with none of the three', async () => {
    const { friend, event } = await sharingFriend();
    const before = Date.now();
    await sendPosition(friend.auth, event, { lat: 33.78, lng: -84.37, accuracy: 9 });

    const share = await stored();
    assert.deepEqual([share.lat, share.lng, share.accuracy, share.seq], [33.78, -84.37, 9, null]);
    assert.ok(share.positionAt.getTime() >= before);
    assert.deepEqual(share.receivedAt, share.positionAt);
  });

  it('is refused when you are not sharing', async () => {
    const { friend, event } = await setup();
    const res = await sendPosition(friend.auth, event, position('0'.repeat(24), 1), 409);
    assert.equal(res.body.message, "You're not sharing your location right now.");
  });
});

describe('the meetup point', () => {
  const setMeetup = (auth, event, body, status = 200) =>
    api().put(`${live(event)}/meetup`).set('Authorization', auth).send(body).expect(status);

  it('can be set by any member and is seen by everyone', async () => {
    const { organizer, friend, event } = await setup();

    await setMeetup(friend.auth, event, { lat: 33.7857, lng: -84.3741, note: '  By the lake  ', time: '19:30' });

    const { meetup } = await getLive(organizer.auth, event);
    assert.equal(meetup.note, 'By the lake');
    assert.equal(meetup.time, '19:30');
    assert.deepEqual([meetup.lat, meetup.lng], [33.7857, -84.3741]);
    assert.deepEqual(meetup.setBy, { user: friend.user._id, name: friend.user.name });
  });

  it('replaces the last one, and can be cleared', async () => {
    const { organizer, friend, event } = await setup();
    await setMeetup(friend.auth, event, { lat: 33.78, lng: -84.37, note: 'Gate A' });
    await setMeetup(organizer.auth, event, { lat: 33.79, lng: -84.38, note: 'Gate B' });
    assert.equal((await getLive(friend.auth, event)).meetup.note, 'Gate B');

    await api().delete(`${live(event)}/meetup`).set('Authorization', friend.auth).expect(204);
    assert.equal((await getLive(friend.auth, event)).meetup, null);
  });

  it('checks the note, time and place', async () => {
    const { friend, event } = await setup();

    assert.equal((await setMeetup(friend.auth, event, { lat: 1, lng: 1, note: 'x'.repeat(81) }, 400)).body.message,
      'Keep the meetup note under 80 characters.');
    assert.equal((await setMeetup(friend.auth, event, { lat: 1, lng: 1, time: '7:30pm' }, 400)).body.message, 'Invalid meetup time.');
    await setMeetup(friend.auth, event, { lat: 100, lng: 1 }, 400);
  });

  it('expires after the day is over', async () => {
    const { friend, event } = await setup();
    await setMeetup(friend.auth, event, { lat: 33.78, lng: -84.37 });
    await Event.updateOne({ _id: event._id }, { 'meetup.expiresAt': new Date(Date.now() - 1000) });

    assert.equal((await getLive(friend.auth, event)).meetup, null);
  });

  it('can be planned before the event, and lasts through its first day', async () => {
    const { friend, event } = await setup({ startDate: '2099-06-10', endDate: '2099-06-12' });
    await setMeetup(friend.auth, event, { lat: 33.78, lng: -84.37, note: 'North gate', time: '10:00' });

    assert.equal((await getLive(friend.auth, event)).meetup.note, 'North gate');
    const stored = await Event.findById(event._id);
    assert.equal(stored.meetup.expiresAt.toISOString(), '2099-06-11T12:00:00.000Z');
  });

  it('stays out of ordinary event responses', async () => {
    const { friend, event } = await setup();
    await setMeetup(friend.auth, event, { lat: 33.78, lng: -84.37 });

    const res = await api().get(`/api/events/${event._id}`).set('Authorization', friend.auth).expect(200);
    assert.equal(res.body.event.meetup, undefined);
  });
});

describe('isHappening', () => {
  const at = new Date('2026-10-24T12:00:00Z');

  it('allows a day either side for time zones', () => {
    assert.equal(isHappening({ startDate: '2026-10-24', endDate: '2026-10-24' }, at), true);
    assert.equal(isHappening({ startDate: '2026-10-25', endDate: '2026-10-26' }, at), true);
    assert.equal(isHappening({ startDate: '2026-10-20', endDate: '2026-10-23' }, at), true);
    assert.equal(isHappening({ startDate: '2026-10-26', endDate: '2026-10-27' }, at), false);
    assert.equal(isHappening({ startDate: '2026-10-01', endDate: '2026-10-22' }, at), false);
  });
});

describe('deleting an event', () => {
  it('deletes everyone\'s shared locations', async () => {
    const { organizer, friend, event } = await setup();
    await startSharing(friend.auth, event);

    await api().delete(`/api/events/${event._id}`).set('Authorization', organizer.auth).expect(204);
    assert.equal(await LocationShare.countDocuments(), 0);
  });
});

describe('demo picnic', () => {
  it('is happening today with three friends sharing and a meetup point', async () => {
    await seedDemoData();
    const login = await api().post('/api/auth/login').send({ email: 'user@example.com', password: 'password' }).expect(200);

    const view = await getLive(`Bearer ${login.body.token}`, { _id: DEMO_EVENT_IDS.picnic });
    assert.deepEqual(view.people.map((p) => p.name), ['Alex', 'Taylor', 'Jordan']);
    assert.equal(view.meetup.note, 'By the lake, near the dock');
    assert.equal(view.sharing, null);
  });

  it('has an afternoon planned and a little to settle up, all valid as if added in the app', async () => {
    await seedDemoData();
    const picnic = await Event.findById(DEMO_EVENT_IDS.picnic);
    const expenses = await Expense.find({ event: picnic._id });

    assert.ok(picnic.schedule.length >= 3);
    for (const item of picnic.schedule) assert.equal(validateScheduleItem(item, picnic), '', item.activity);
    assert.equal(expenses.length, 2);
    for (const e of expenses) {
      const fields = { ...e.toObject(), paidBy: e.paidBy.user.toString(), shares: e.shares.map((x) => ({ user: x.user.toString(), amountCents: x.amountCents })) };
      assert.equal(validateExpense(fields, picnic), '', e.description);
    }
  });

  it("is dated by Atlanta's calendar, not the server's UTC clock", async () => {
    await seedDemoData();
    const picnic = await Event.findById(DEMO_EVENT_IDS.picnic);
    assert.equal(picnic.startDate, dayIn('America/New_York'));
    assert.equal(picnic.endDate, picnic.startDate);
  });
});

describe('dayIn', () => {
  it("gives a time zone's own calendar day", () => {
    // 9 pm on Oct 24 in Atlanta is already Oct 25 in UTC
    const evening = Date.parse('2026-10-25T01:07:00Z');
    assert.equal(dayIn('America/New_York', evening), '2026-10-24');
    assert.equal(dayIn('UTC', evening), '2026-10-25');
  });
});
