const { useTestDatabase, api, registerUser, assertFields } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const Event = require('../src/models/Event');
const { seedDemoData, DEMO_EVENT_IDS } = require('../src/seed/demoData');

useTestDatabase();

const newItem = {
  date: '2099-11-25',
  startTime: '14:00',
  endTime: '15:30',
  activity: 'Arctic Monkeys',
  location: 'Main Stage'
};

// An event (Nov 25-27, 2099) organized by one user with another user as member
const setup = async () => {
  const organizer = await registerUser();
  const member = await registerUser();
  const event = await Event.create({
    name: 'Festival',
    startDate: '2099-11-25',
    endDate: '2099-11-27',
    createdBy: organizer.user._id,
    members: [
      { user: organizer.user._id, name: organizer.user.name },
      { user: member.user._id, name: member.user.name }
    ]
  });
  return { organizer, member, eventId: event._id.toString() };
};

const schedulePath = (eventId, ...rest) => ['/api/events', eventId, 'schedule', ...rest].join('/');

const addItem = (auth, eventId, overrides = {}) =>
  api().post(schedulePath(eventId)).set('Authorization', auth).send({ ...newItem, ...overrides });

describe('POST /api/events/:id/schedule', () => {
  it('lets any member add an item', async () => {
    const { member, eventId } = await setup();
    const res = await addItem(member.auth, eventId).expect(201);

    assert.equal(res.body.event.schedule.length, 1);
    assertFields(res.body.event.schedule[0], { ...newItem, attendees: [], createdBy: member.user._id });
  });

  it('allows leaving out the end time', async () => {
    const { member, eventId } = await setup();
    const res = await addItem(member.auth, eventId, { endTime: '' }).expect(201);

    assert.equal(res.body.event.schedule[0].endTime, '');
  });

  const invalid = [
    ['a missing activity', { activity: '  ' }, "Please enter what's happening."],
    ['an activity over 80 characters', { activity: 'a'.repeat(81) }, 'Activity must be 80 characters or fewer.'],
    ['a day before the event', { date: '2099-11-24' }, 'Please choose a day during the event.'],
    ['a day after the event', { date: '2099-11-28' }, 'Please choose a day during the event.'],
    ['an impossible day', { date: '2099-02-30' }, 'Please choose a day.'],
    ['a missing start time', { startTime: '' }, 'Please choose a start time.'],
    ['an invalid start time', { startTime: '25:00' }, 'Please choose a valid start time.'],
    ['an invalid end time', { endTime: '3pm' }, 'Please choose a valid end time.'],
    ['an end before the start', { endTime: '13:00' }, 'The end time must be after the start time.'],
    ['an end equal to the start', { endTime: '14:00' }, 'The end time must be after the start time.']
  ];
  for (const [label, overrides, message] of invalid) {
    it(`rejects ${label}`, async () => {
      const { member, eventId } = await setup();
      const res = await addItem(member.auth, eventId, overrides).expect(400);

      assert.equal(res.body.message, message);
    });
  }

  it("returns 404 for an event you're not in", async () => {
    const { eventId } = await setup();
    const stranger = await registerUser();

    await addItem(stranger.auth, eventId).expect(404);
  });
});

describe('PATCH /api/events/:id/schedule/:itemId', () => {
  it('lets a member edit an item someone else added', async () => {
    const { organizer, member, eventId } = await setup();
    const { body } = await addItem(organizer.auth, eventId);
    const itemId = body.event.schedule[0]._id;

    const res = await api()
      .patch(schedulePath(eventId, itemId))
      .set('Authorization', member.auth)
      .send({ activity: 'Tame Impala', startTime: '16:00', endTime: '17:00' })
      .expect(200);

    assertFields(res.body.event.schedule[0], { activity: 'Tame Impala', startTime: '16:00', endTime: '17:00', location: 'Main Stage' });
  });

  it('validates the item as it would be after the change', async () => {
    const { member, eventId } = await setup();
    const { body } = await addItem(member.auth, eventId);
    const itemId = body.event.schedule[0]._id;

    // Only the start changes, but it would now be after the existing 15:30 end
    const res = await api()
      .patch(schedulePath(eventId, itemId))
      .set('Authorization', member.auth)
      .send({ startTime: '16:00' })
      .expect(400);
    assert.equal(res.body.message, 'The end time must be after the start time.');
  });

  it('returns 404 for an unknown item', async () => {
    const { member, eventId } = await setup();
    await api()
      .patch(schedulePath(eventId, '000000000000000000000000'))
      .set('Authorization', member.auth)
      .send({ activity: 'X' })
      .expect(404);
  });
});

describe('DELETE /api/events/:id/schedule/:itemId', () => {
  it('lets a member remove an item', async () => {
    const { organizer, member, eventId } = await setup();
    const { body } = await addItem(organizer.auth, eventId);
    const itemId = body.event.schedule[0]._id;

    const res = await api().delete(schedulePath(eventId, itemId)).set('Authorization', member.auth).expect(200);
    assert.deepEqual(res.body.event.schedule, []);
  });

  it("can't remove items from an event you're not in", async () => {
    const { organizer, eventId } = await setup();
    const stranger = await registerUser();
    const { body } = await addItem(organizer.auth, eventId);

    await api().delete(schedulePath(eventId, body.event.schedule[0]._id)).set('Authorization', stranger.auth).expect(404);
  });
});

describe('going to a schedule item', () => {
  const going = (auth, eventId, itemId, method = 'put') =>
    api()[method](schedulePath(eventId, itemId, 'going')).set('Authorization', auth);

  it('adds you to the attendees, by name', async () => {
    const { member, eventId } = await setup();
    const { body } = await addItem(member.auth, eventId);
    const itemId = body.event.schedule[0]._id;

    const res = await going(member.auth, eventId, itemId).expect(200);
    assert.deepEqual(res.body.event.schedule[0].attendees, [{ user: member.user._id, name: member.user.name }]);
  });

  it('only lists you once if you tap going twice', async () => {
    const { member, eventId } = await setup();
    const { body } = await addItem(member.auth, eventId);
    const itemId = body.event.schedule[0]._id;

    await going(member.auth, eventId, itemId).expect(200);
    const res = await going(member.auth, eventId, itemId).expect(200);
    assert.equal(res.body.event.schedule[0].attendees.length, 1);
  });

  it('keeps both people when two join at the same moment', async () => {
    const { organizer, member, eventId } = await setup();
    const { body } = await addItem(member.auth, eventId);
    const itemId = body.event.schedule[0]._id;

    await Promise.all([going(organizer.auth, eventId, itemId), going(member.auth, eventId, itemId)]);

    const event = await Event.findById(eventId);
    const names = event.schedule[0].attendees.map((a) => a.name).sort();
    assert.deepEqual(names, [organizer.user.name, member.user.name].sort());
  });

  it('removes only you when you stop going', async () => {
    const { organizer, member, eventId } = await setup();
    const { body } = await addItem(member.auth, eventId);
    const itemId = body.event.schedule[0]._id;
    await going(organizer.auth, eventId, itemId);
    await going(member.auth, eventId, itemId);

    const res = await going(member.auth, eventId, itemId, 'delete').expect(200);
    assert.deepEqual(res.body.event.schedule[0].attendees.map((a) => a.user), [organizer.user._id]);
  });

  it("returns 404 for an event you're not in", async () => {
    const { member, eventId } = await setup();
    const stranger = await registerUser();
    const { body } = await addItem(member.auth, eventId);

    await going(stranger.auth, eventId, body.event.schedule[0]._id).expect(404);
    const event = await Event.findById(eventId);
    assert.equal(event.schedule[0].attendees.length, 0);
  });

  it('returns 404 for an unknown item', async () => {
    const { member, eventId } = await setup();
    await going(member.auth, eventId, '000000000000000000000000').expect(404);
  });
});

describe('demo data', () => {
  it('seeds schedule items in the current format', async () => {
    const user = await seedDemoData();
    const festival = await Event.findById(DEMO_EVENT_IDS.festival);

    assert.equal(festival.schedule.length, 4);
    assertFields(festival.schedule[0].toObject(), { startTime: '14:00', endTime: '15:30', activity: 'Arctic Monkeys' });
    assert.equal(festival.schedule[0].attendees[0].user.toString(), user._id.toString());
  });
});
