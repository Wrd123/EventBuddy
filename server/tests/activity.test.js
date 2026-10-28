const { useTestDatabase, api, registerUser } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const mongoose = require('mongoose');
const Activity = require('../src/models/Activity');
const Expense = require('../src/models/Expense');
const Payment = require('../src/models/Payment');
const Event = require('../src/models/Event');
const LocationShare = require('../src/models/LocationShare');
const realtime = require('../src/realtime/hub');
const { timing } = require('../src/activityLog');
const { PAGE_SIZE } = require('../src/routes/activity');
const { createDemoWorld, pruneDemoWorlds } = require('../src/seed/demoData');

useTestDatabase();

const DAY = 24 * 60 * 60 * 1000;
const isoDay = (offset = 0) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const inHours = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
const path = (event, ...rest) => ['/api/events', event._id, ...rest].join('/');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// An event happening now, its organizer and a friend who joined
const setup = async () => {
  const organizer = await registerUser();
  const friend = await registerUser();
  const { body } = await api()
    .post('/api/events')
    .set('Authorization', organizer.auth)
    .send({ name: 'Weekend', startDate: isoDay(0), endDate: isoDay(1), location: 'Piedmont Park' })
    .expect(201);
  await api().post(`/api/invites/${body.event.inviteCode}/join`).set('Authorization', friend.auth).expect(200);
  return { organizer, friend, event: body.event };
};

// Every line in the event, oldest first, as stored
const lines = (event) => Activity.find({ event: event._id }).sort({ _id: 1 }).lean();
const kinds = async (event) => (await lines(event)).map((line) => line.kind);
const newest = async (event) => (await lines(event)).at(-1);

const dinner = (organizer, friend, overrides = {}) => ({
  description: 'Dinner',
  amountCents: 6000,
  date: isoDay(0),
  paidBy: organizer.user._id,
  splitType: 'equal',
  shares: [{ user: organizer.user._id, amountCents: 3000 }, { user: friend.user._id, amountCents: 3000 }],
  ...overrides
});

const payBack = (organizer, friend, overrides = {}) =>
  ({ from: friend.user._id, to: organizer.user._id, amountCents: 3000, date: isoDay(0), ...overrides });

describe('what gets recorded', () => {
  it('records someone joining once, however often they open the link', async () => {
    const { friend, event } = await setup();
    await api().post(`/api/invites/${event.inviteCode}/join`).set('Authorization', friend.auth).expect(200);

    const all = await lines(event);
    assert.equal(all.length, 1);
    assert.equal(all[0].kind, 'joined');
    assert.equal(String(all[0].actor.user), friend.user._id);
    assert.equal(all[0].actor.name, friend.user.name);
  });

  it('follows a plan: added, renamed, and gone when it is', async () => {
    const { organizer, friend, event } = await setup();
    const { body } = await api().post(path(event, 'schedule')).set('Authorization', friend.auth)
      .send({ date: isoDay(0), startTime: '10:00', activity: 'Brunch' }).expect(201);
    const item = body.event.schedule.find((i) => i.activity === 'Brunch');

    let line = await newest(event);
    assert.equal(line.kind, 'schedule_added');
    assert.equal(String(line.subject), item._id);
    assert.deepEqual(line.data, { activity: 'Brunch' });

    await api().patch(path(event, 'schedule', item._id)).set('Authorization', organizer.auth)
      .send({ activity: 'Late brunch' }).expect(200);
    line = await newest(event);
    assert.equal(line.data.activity, 'Late brunch');
    // Still the friend's line: they added it
    assert.equal(String(line.actor.user), friend.user._id);

    // Going isn't news
    await api().put(path(event, 'schedule', item._id, 'going')).set('Authorization', friend.auth).expect(200);
    assert.deepEqual(await kinds(event), ['joined', 'schedule_added']);

    await api().delete(path(event, 'schedule', item._id)).set('Authorization', organizer.auth).expect(200);
    assert.deepEqual(await kinds(event), ['joined']);
  });

  it('follows an expense: added, changed, and gone when it is', async () => {
    const { organizer, friend, event } = await setup();
    const { body } = await api().post(path(event, 'expenses')).set('Authorization', organizer.auth)
      .send(dinner(organizer, friend)).expect(201);

    let line = await newest(event);
    assert.equal(line.kind, 'expense_added');
    assert.equal(String(line.subject), body.expense._id);
    assert.deepEqual(line.data, { description: 'Dinner', amountCents: 6000 });

    await api().patch(path(event, 'expenses', body.expense._id)).set('Authorization', organizer.auth)
      .send(dinner(organizer, friend, {
        description: 'Dinner and drinks',
        amountCents: 8000,
        shares: [{ user: organizer.user._id, amountCents: 4000 }, { user: friend.user._id, amountCents: 4000 }]
      })).expect(200);
    line = await newest(event);
    assert.deepEqual(line.data, { description: 'Dinner and drinks', amountCents: 8000 });

    await api().delete(path(event, 'expenses', body.expense._id)).set('Authorization', organizer.auth).expect(204);
    assert.deepEqual(await kinds(event), ['joined']);
  });

  it('records a recorded payment with both people, and drops it when it is taken back', async () => {
    const { organizer, friend, event } = await setup();
    await api().post(path(event, 'expenses')).set('Authorization', organizer.auth).send(dinner(organizer, friend)).expect(201);
    // The one who was paid can record it too, and is the one who did
    const { body } = await api().post(path(event, 'payments')).set('Authorization', organizer.auth)
      .send(payBack(organizer, friend)).expect(201);

    const line = await newest(event);
    assert.equal(line.kind, 'payment_marked');
    assert.equal(String(line.actor.user), organizer.user._id);
    assert.equal(String(line.subject), body.payment._id);
    assert.deepEqual(line.data, {
      from: { user: new mongoose.Types.ObjectId(friend.user._id), name: friend.user.name },
      to: { user: new mongoose.Types.ObjectId(organizer.user._id), name: organizer.user.name },
      amountCents: 3000
    });

    await api().delete(path(event, 'payments', body.payment._id)).set('Authorization', organizer.auth).expect(204);
    assert.deepEqual(await kinds(event), ['joined', 'expense_added']);
  });

  it('records a retried expense or payment once', async () => {
    const { organizer, friend, event } = await setup();
    const expense = dinner(organizer, friend, { clientId: 'expense-1' });
    await api().post(path(event, 'expenses')).set('Authorization', organizer.auth).send(expense).expect(201);
    await api().post(path(event, 'expenses')).set('Authorization', organizer.auth).send(expense).expect(200);
    const payment = payBack(organizer, friend, { clientId: 'payment-1' });
    await api().post(path(event, 'payments')).set('Authorization', friend.auth).send(payment).expect(201);
    await api().post(path(event, 'payments')).set('Authorization', friend.auth).send(payment).expect(200);

    assert.deepEqual(await kinds(event), ['joined', 'expense_added', 'payment_marked']);
  });

  it('records who set the meetup point, never where or the note', async () => {
    const { friend, event } = await setup();
    await api().put(path(event, 'live', 'meetup')).set('Authorization', friend.auth)
      .send({ lat: 40.71234, lng: -74.00567, note: 'By the big oak' }).expect(200);

    const line = await newest(event);
    assert.equal(line.kind, 'meetup_set');
    assert.equal(String(line.actor.user), friend.user._id);
    const stored = JSON.stringify(line);
    for (const secret of ['40.71234', '-74.00567', 'By the big oak']) assert.ok(!stored.includes(secret), secret);
  });

  it("can't store anything a line doesn't need, or a kind it doesn't know", async () => {
    const { friend, event } = await setup();
    const actor = { user: friend.user._id, name: friend.user.name };
    const line = await Activity.create({ event: event._id, actor, kind: 'meetup_set', data: { lat: 40.7, lng: -74, note: 'Here' } });
    // None of it is kept (an empty data isn't stored at all)
    assert.equal((await Activity.findById(line._id).lean()).data, undefined);
    await assert.rejects(Activity.create({ event: event._id, actor, kind: 'location_shared' }), /kind/);
  });

  it('records someone leaving, but not someone being removed', async () => {
    const { organizer, friend, event } = await setup();
    const other = await registerUser();
    await api().post(`/api/invites/${event.inviteCode}/join`).set('Authorization', other.auth).expect(200);

    await api().delete(path(event, 'members', friend.user._id)).set('Authorization', friend.auth).expect(204);
    await api().delete(path(event, 'members', other.user._id)).set('Authorization', organizer.auth).expect(204);

    const all = await lines(event);
    assert.deepEqual(all.map((l) => l.kind), ['joined', 'joined', 'left']);
    assert.equal(String(all[2].actor.user), friend.user._id);
  });

  it('names what an edit changed, and records nothing for a save that changed nothing', async () => {
    const { organizer, event } = await setup();
    await api().patch(path(event)).set('Authorization', organizer.auth)
      .send({ name: 'Long weekend', location: 'Grant Park', budgetCents: 20000 }).expect(200);
    assert.deepEqual((await newest(event)).data, { fields: ['name', 'location', 'budgetCents'] });

    await api().patch(path(event)).set('Authorization', organizer.auth)
      .send({ name: 'Long weekend', location: 'Grant Park', budgetCents: 20000 }).expect(200);
    assert.deepEqual(await kinds(event), ['joined', 'event_updated']);
  });
});

describe('sharing starts', () => {
  const share = (person, event, until = inHours(1)) =>
    api().put(path(event, 'live', 'share')).set('Authorization', person.auth).send({ until }).expect(200);

  it('records starting to share, but not changing until when', async () => {
    const { friend, event } = await setup();
    await share(friend, event, inHours(1));
    await share(friend, event, inHours(3));

    assert.deepEqual(await kinds(event), ['joined', 'sharing_started']);
  });

  it('counts sharing again after a share ran out as a start, without the old position', async () => {
    const { organizer, friend, event } = await setup();
    await share(friend, event);
    await api().put(path(event, 'live', 'position')).set('Authorization', friend.auth).send({ lat: 33.78, lng: -84.37 }).expect(204);
    // Ran out, but MongoDB's sweep hasn't removed it yet
    await LocationShare.updateOne({ event: event._id, user: friend.user._id }, { until: new Date(Date.now() - 1000) });

    await share(friend, event);
    assert.deepEqual(await kinds(event), ['joined', 'sharing_started', 'sharing_started']);
    // Friends see them again once the phone sends where it is now
    const { body } = await api().get(path(event, 'live')).set('Authorization', organizer.auth).expect(200);
    assert.deepEqual(body.people, []);
  });

  it('counts a start even when the old share runs out after the clean-up looked', async (t) => {
    const { friend, event } = await setup();
    await share(friend, event);
    await LocationShare.updateOne({ event: event._id, user: friend.user._id }, { until: new Date(Date.now() - 1000) });
    // As if it ran out a moment after the clean-up checked
    t.mock.method(LocationShare, 'deleteOne', async () => ({ deletedCount: 0 }));

    await share(friend, event);
    assert.deepEqual(await kinds(event), ['joined', 'sharing_started', 'sharing_started']);
  });

  it('records one start when two taps arrive at once', async () => {
    const { friend, event } = await setup();
    await Promise.all([share(friend, event), share(friend, event)]);

    assert.equal(await LocationShare.countDocuments({ event: event._id, user: friend.user._id }), 1);
    assert.deepEqual(await kinds(event), ['joined', 'sharing_started']);
  });
});

describe('GET /api/events/:id/activity', () => {
  it('pages back from the newest, a page at a time', async () => {
    const { organizer, friend, event } = await setup();
    const actor = { user: friend.user._id, name: friend.user.name };
    // Ids made one after another increase, like lines written over time
    await Activity.insertMany(Array.from({ length: 25 }, () =>
      ({ _id: new mongoose.Types.ObjectId(), event: event._id, actor, kind: 'meetup_set' })));

    const first = (await api().get(path(event, 'activity')).set('Authorization', organizer.auth).expect(200)).body;
    assert.equal(first.activity.length, PAGE_SIZE);
    assert.equal(first.hasMore, true);
    const second = (await api().get(path(event, 'activity')).query({ before: first.activity.at(-1)._id })
      .set('Authorization', organizer.auth).expect(200)).body;
    assert.equal(second.hasMore, false);

    const ids = [...first.activity, ...second.activity].map((line) => line._id);
    assert.equal(ids.length, 26);
    assert.deepEqual(ids, [...ids].sort().reverse());
    // The oldest is the friend joining
    assert.equal(second.activity.at(-1).kind, 'joined');
  });

  it('refuses a cursor that is not an id', async () => {
    const { organizer, event } = await setup();
    await api().get(path(event, 'activity')).query({ before: 'nope' }).set('Authorization', organizer.auth).expect(400);
  });

  it('is for members only: strangers and removed people get 404', async () => {
    const { organizer, friend, event } = await setup();
    const stranger = await registerUser();
    await api().get(path(event, 'activity')).set('Authorization', stranger.auth).expect(404);

    await api().delete(path(event, 'members', friend.user._id)).set('Authorization', organizer.auth).expect(204);
    await api().get(path(event, 'activity')).set('Authorization', friend.auth).expect(404);
  });

  it('goes with the event', async () => {
    const { organizer, event } = await setup();
    await api().delete(path(event)).set('Authorization', organizer.auth).expect(204);
    assert.equal(await Activity.countDocuments({ event: event._id }), 0);
  });
});

describe('a line never costs the change it describes', () => {
  it('saves the expense when the line fails', async (t) => {
    const { organizer, friend, event } = await setup();
    t.mock.method(Activity, 'create', async () => { throw new Error('Database hiccup'); });

    await api().post(path(event, 'expenses')).set('Authorization', organizer.auth).send(dinner(organizer, friend)).expect(201);
    assert.equal(await Expense.countDocuments({ event: event._id }), 1);
  });

  it("answers, and lets the next payment through, when the line never finishes", async (t) => {
    const { organizer, friend, event } = await setup();
    const { waitMs } = timing;
    timing.waitMs = 50;
    t.after(() => { timing.waitMs = waitMs; });
    t.mock.method(Activity, 'create', () => new Promise(() => {}));

    const started = Date.now();
    await api().post(path(event, 'expenses')).set('Authorization', organizer.auth).send(dinner(organizer, friend)).expect(201);
    // The payment waits on the same ledger lock as the expense
    await api().post(path(event, 'payments')).set('Authorization', friend.auth).send(payBack(organizer, friend)).expect(201);
    assert.ok(Date.now() - started < 1000, 'neither waited for its line');
    assert.equal(await Payment.countDocuments({ event: event._id }), 1);
  });

  it('pokes the event itself when a line lands after the response', async (t) => {
    const { organizer, friend, event } = await setup();
    const notify = t.mock.method(realtime, 'notifyEvent');
    const { waitMs } = timing;
    t.after(() => { timing.waitMs = waitMs; });

    // In time: the response's own poke covers it
    await api().post(path(event, 'expenses')).set('Authorization', organizer.auth).send(dinner(organizer, friend)).expect(201);
    assert.equal(notify.mock.callCount(), 0);

    timing.waitMs = 20;
    const create = Activity.create.bind(Activity);
    t.mock.method(Activity, 'create', async (doc) => {
      await sleep(80);
      return create(doc);
    });
    await api().post(path(event, 'expenses')).set('Authorization', organizer.auth)
      .send(dinner(organizer, friend, { description: 'Taxi' })).expect(201);
    for (let tries = 0; tries < 50 && notify.mock.callCount() === 0; tries += 1) await sleep(20);

    assert.equal(notify.mock.callCount(), 1);
    assert.deepEqual(notify.mock.calls[0].arguments.map(String), [event._id, 'event']);
    assert.equal((await newest(event)).data.description, 'Taxi');
  });
});

describe('demo history', () => {
  it("gives a new world's picnic a history that matches what's in it", async () => {
    const me = await createDemoWorld();
    const picnic = await Event.findOne({ name: 'Picnic in the Park', 'members.user': me._id });
    const history = await lines(picnic);

    assert.deepEqual(history.map((l) => l.kind), [
      'joined', 'joined', 'joined',
      'schedule_added', 'schedule_added', 'schedule_added', 'schedule_added',
      'expense_added', 'expense_added',
      'sharing_started', 'sharing_started', 'sharing_started',
      'meetup_set'
    ]);
    // Id order is time order, as the paging needs
    assert.deepEqual(history.map((l) => l.createdAt.getTime()), history.map((l) => l.createdAt.getTime()).sort((a, b) => a - b));
    // The meetup line was written when the meetup point says it was set
    assert.ok(Math.abs(history.at(-1).createdAt - picnic.meetup.setAt) < 5000);
    // Every line about something points at something that's there
    const expenses = await Expense.find({ event: picnic._id });
    for (const line of history.filter((l) => l.subject)) {
      const found = picnic.schedule.id(line.subject) || expenses.find((e) => e._id.equals(line.subject));
      assert.ok(found, `${line.kind} ${line.subject}`);
    }
  });

  it('is pruned with its world', async () => {
    await createDemoWorld();
    assert.ok(await Activity.countDocuments() > 0);
    await pruneDemoWorlds({ maxAgeMs: -1, maxWorlds: 100 });
    assert.equal(await Activity.countDocuments(), 0);
  });
});
