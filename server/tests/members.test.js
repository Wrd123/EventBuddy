const { useTestDatabase, api, registerUser } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const LocationShare = require('../src/models/LocationShare');
const ChatRead = require('../src/models/ChatRead');
const Event = require('../src/models/Event');
const { withEventLock } = require('../src/eventLock');

useTestDatabase();

const DAY = 24 * 60 * 60 * 1000;
const isoDay = (offset = 0) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

// An event happening now (so location can be shared), with its organizer
// and two friends who joined by invite
const setup = async () => {
  const organizer = await registerUser();
  const friend = await registerUser();
  const other = await registerUser();
  const { body } = await api()
    .post('/api/events')
    .set('Authorization', organizer.auth)
    .send({ name: 'Weekend', startDate: isoDay(0), endDate: isoDay(1) })
    .expect(201);
  const event = body.event;
  for (const person of [friend, other]) {
    await api().post(`/api/invites/${event.inviteCode}/join`).set('Authorization', person.auth).expect(200);
  }
  return { organizer, friend, other, event };
};

const path = (event, ...rest) => ['/api/events', event._id, ...rest].join('/');
const leaveOrRemove = (auth, event, userId) => api().delete(path(event, 'members', userId)).set('Authorization', auth);

// $60 dinner paid by the organizer, split evenly between organizer and friend
const dinner = (organizer, friend) => ({
  description: 'Dinner', amountCents: 6000, date: isoDay(0), paidBy: organizer.user._id, splitType: 'equal',
  shares: [{ user: organizer.user._id, amountCents: 3000 }, { user: friend.user._id, amountCents: 3000 }]
});

// Every place a member can reach; someone who's gone gets 404 from each
const memberOnlyRoutes = (event) => [
  path(event), path(event, 'messages'), path(event, 'live'), path(event, 'expenses'), path(event, 'payment-handles')
];

const assertNoAccess = async (auth, event) => {
  for (const route of memberOnlyRoutes(event)) {
    await api().get(route).set('Authorization', auth).expect(404);
  }
  await api().post(path(event, 'schedule')).set('Authorization', auth)
    .send({ date: isoDay(0), startTime: '10:00', activity: 'Sneaking back' }).expect(404);
};

describe('leaving an event', () => {
  it('takes you out of everything at once, along with your shared location', async () => {
    const { friend, event } = await setup();
    await api().put(path(event, 'live', 'share')).set('Authorization', friend.auth)
      .send({ until: new Date(Date.now() + 60 * 60 * 1000).toISOString() }).expect(200);
    await api().put(path(event, 'messages', 'read')).set('Authorization', friend.auth)
      .send({ lastRead: '000000000000000000000000' }).expect(204);

    await leaveOrRemove(friend.auth, event, friend.user._id).expect(204);

    await assertNoAccess(friend.auth, event);
    assert.equal(await LocationShare.countDocuments({ user: friend.user._id }), 0);
    assert.equal(await ChatRead.countDocuments({ user: friend.user._id }), 0);
  });

  it('lets you rejoin with the link, since nobody removed you', async () => {
    const { friend, event } = await setup();
    await leaveOrRemove(friend.auth, event, friend.user._id).expect(204);
    await api().post(`/api/invites/${event.inviteCode}/join`).set('Authorization', friend.auth).expect(200);
  });

  it("isn't for the organizer, who deletes the event instead", async () => {
    const { organizer, event } = await setup();
    const res = await leaveOrRemove(organizer.auth, event, organizer.user._id).expect(409);
    assert.equal(res.body.message, "You're the organizer. Delete the event instead.");
  });

  it('waits until you have settled up, from either side', async () => {
    const { organizer, friend, event } = await setup();
    await api().post(path(event, 'expenses')).set('Authorization', organizer.auth).send(dinner(organizer, friend)).expect(201);

    const owes = await leaveOrRemove(friend.auth, event, friend.user._id).expect(409);
    assert.equal(owes.body.message, 'You still owe $30.00 in this event. Settle up first.');

    await api().post(path(event, 'payments')).set('Authorization', friend.auth)
      .send({ from: friend.user._id, to: organizer.user._id, amountCents: 3000, date: isoDay(0) }).expect(201);
    await leaveOrRemove(friend.auth, event, friend.user._id).expect(204);
  });
});

describe('removing someone', () => {
  it('is for the organizer, and takes them out of everything', async () => {
    const { organizer, friend, event } = await setup();
    await leaveOrRemove(organizer.auth, event, friend.user._id).expect(204);
    await assertNoAccess(friend.auth, event);

    const { body } = await api().get(path(event)).set('Authorization', organizer.auth).expect(200);
    assert.ok(!body.event.members.some((m) => m.user === friend.user._id));
  });

  it("isn't something other members can do", async () => {
    const { friend, other, event } = await setup();
    const res = await leaveOrRemove(friend.auth, event, other.user._id).expect(403);
    assert.equal(res.body.message, 'Only the organizer can remove people.');
  });

  it("can't remove the organizer, or someone who isn't in the event", async () => {
    const { organizer, friend, event } = await setup();
    const stranger = await registerUser();
    await leaveOrRemove(organizer.auth, event, stranger.user._id).expect(404);
    await leaveOrRemove(organizer.auth, event, 'not-an-id').expect(404);
    await leaveOrRemove(friend.auth, event, organizer.user._id).expect(403);
  });

  it('waits until they have settled up, and says who', async () => {
    const { organizer, friend, event } = await setup();
    await api().post(path(event, 'expenses')).set('Authorization', organizer.auth).send(dinner(friend, organizer)).expect(201);

    const res = await leaveOrRemove(organizer.auth, event, friend.user._id).expect(409);
    assert.equal(res.body.message, `${friend.user.name} is still owed $30.00 in this event. Settle up first.`);
  });

  it('keeps them out of an old link until the organizer lets them back in', async () => {
    const { organizer, friend, event } = await setup();
    await leaveOrRemove(organizer.auth, event, friend.user._id).expect(204);

    const preview = await api().get(`/api/invites/${event.inviteCode}`).set('Authorization', friend.auth).expect(200);
    assert.equal(preview.body.invite.isRemoved, true);
    const join = await api().post(`/api/invites/${event.inviteCode}/join`).set('Authorization', friend.auth).expect(403);
    assert.equal(join.body.message, "You can't join this event. Ask the organizer if you think that's a mistake.");

    const removed = await api().get(path(event, 'removed')).set('Authorization', organizer.auth).expect(200);
    assert.deepEqual(removed.body.removed, [{ user: friend.user._id, name: friend.user.name }]);

    await api().delete(path(event, 'removed', friend.user._id)).set('Authorization', organizer.auth).expect(204);
    await api().post(`/api/invites/${event.inviteCode}/join`).set('Authorization', friend.auth).expect(200);
  });

  it('keeps the removed list to the organizer', async () => {
    const { organizer, friend, other, event } = await setup();
    await leaveOrRemove(organizer.auth, event, friend.user._id).expect(204);

    await api().get(path(event, 'removed')).set('Authorization', other.auth).expect(403);
    const { body } = await api().get(path(event)).set('Authorization', other.auth).expect(200);
    assert.equal(body.event.removed, undefined);
    const list = await api().get('/api/events').set('Authorization', organizer.auth).expect(200);
    assert.equal(list.body.events[0].removed, undefined);
  });

  it('checks a new expense against who is in the event once any change ahead of it has finished', async () => {
    const { organizer, friend, event } = await setup();
    // A removal is underway: hold the event's lock while it runs
    let finishRemoval;
    const removal = withEventLock(event._id, () => new Promise((resolve) => { finishRemoval = resolve; }));
    const expense = api().post(path(event, 'expenses')).set('Authorization', organizer.auth)
      .send(dinner(organizer, friend)).then((res) => res);

    await new Promise((resolve) => setTimeout(resolve, 100));
    await Event.updateOne({ _id: event._id }, { $pull: { members: { user: friend.user._id } } });
    finishRemoval();
    await removal;

    // Had the expense loaded the members before waiting, it would have put a
    // $30 debt on someone who's no longer in the event
    const res = await expense;
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Everyone in the split must be in the event.');
  });
});

describe('expenses with someone who has left', () => {
  it('can still be edited', async () => {
    const { organizer, friend, event } = await setup();
    const { body } = await api().post(path(event, 'expenses')).set('Authorization', organizer.auth)
      .send(dinner(organizer, friend)).expect(201);
    await api().post(path(event, 'payments')).set('Authorization', friend.auth)
      .send({ from: friend.user._id, to: organizer.user._id, amountCents: 3000, date: isoDay(0) }).expect(201);
    await leaveOrRemove(friend.auth, event, friend.user._id).expect(204);

    const res = await api().patch(path(event, 'expenses', body.expense._id)).set('Authorization', organizer.auth)
      .send({ ...dinner(organizer, friend), description: 'Dinner at Mel\'s' }).expect(200);
    assert.equal(res.body.expense.shares[1].name, friend.user.name);
  });

  // The friend paid their $30 back and left: changing what they owed, or
  // removing the dinner or their payment, would leave them owing or owed
  // with no way to settle up
  const settledAndGone = async () => {
    const context = await setup();
    const { organizer, friend, event } = context;
    const { body } = await api().post(path(event, 'expenses')).set('Authorization', organizer.auth)
      .send(dinner(organizer, friend)).expect(201);
    const paid = await api().post(path(event, 'payments')).set('Authorization', friend.auth)
      .send({ from: friend.user._id, to: organizer.user._id, amountCents: 3000, date: isoDay(0) }).expect(201);
    await leaveOrRemove(friend.auth, event, friend.user._id).expect(204);
    return { ...context, expenseId: body.expense._id, paymentId: paid.body.payment._id };
  };
  const gone = (friend) =>
    `That would change the balance of ${friend.user.name}, who left the event. Change the others' shares instead.`;

  it("won't change what someone who left owes", async () => {
    const { organizer, friend, event, expenseId } = await settledAndGone();
    const res = await api().patch(path(event, 'expenses', expenseId)).set('Authorization', organizer.auth)
      .send({
        ...dinner(organizer, friend),
        splitType: 'exact',
        shares: [{ user: organizer.user._id, amountCents: 2000 }, { user: friend.user._id, amountCents: 4000 }]
      }).expect(409);
    assert.equal(res.body.message, gone(friend));
  });

  it("won't delete an expense or payment that someone who left was even on", async () => {
    const { organizer, friend, event, expenseId, paymentId } = await settledAndGone();
    assert.equal((await api().delete(path(event, 'expenses', expenseId)).set('Authorization', organizer.auth).expect(409)).body.message, gone(friend));
    assert.equal((await api().delete(path(event, 'payments', paymentId)).set('Authorization', organizer.auth).expect(409)).body.message, gone(friend));
  });

  it("can't add them to a new one", async () => {
    const { organizer, friend, event } = await setup();
    await leaveOrRemove(friend.auth, event, friend.user._id).expect(204);
    await api().post(path(event, 'expenses')).set('Authorization', organizer.auth).send(dinner(organizer, friend)).expect(400);
  });
});
