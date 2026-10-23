const { useTestDatabase, api, registerUser, assertFields } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const Event = require('../src/models/Event');

useTestDatabase();

const newEvent = {
  name: 'Friendsgiving',
  type: 'outdoor',
  startDate: '2099-11-25',
  endDate: '2099-11-27',
  location: 'Atlanta, GA'
};

const createEvent = (auth, overrides = {}) =>
  api().post('/api/events').set('Authorization', auth).send({ ...newEvent, ...overrides });

describe('POST /api/events', () => {
  it('creates an event with the creator as its only member', async () => {
    const { auth, user } = await registerUser();
    const res = await createEvent(auth).expect(201);

    assertFields(res.body.event, {
      name: 'Friendsgiving',
      startDate: '2099-11-25',
      endDate: '2099-11-27',
      createdBy: user._id,
      schedule: []
    });
    assert.equal(res.body.event.members.length, 1);
    assertFields(res.body.event.members[0], { user: user._id, name: user.name });
    assert.match(res.body.event.inviteCode, /^[A-Za-z0-9_-]{12}$/);
  });

  it('takes the creator from the token, not the request body', async () => {
    const { auth, user } = await registerUser();
    const other = await registerUser();
    const res = await createEvent(auth, {
      createdBy: other.user._id,
      members: [{ user: other.user._id, name: 'Spoofed' }]
    }).expect(201);

    assert.equal(res.body.event.createdBy, user._id);
    assert.equal(res.body.event.members[0].name, user.name);
  });

  it('trims text fields', async () => {
    const { auth } = await registerUser();
    const res = await createEvent(auth, { name: '  Friendsgiving  ', location: '  Atlanta  ' }).expect(201);

    assert.equal(res.body.event.name, 'Friendsgiving');
    assert.equal(res.body.event.location, 'Atlanta');
  });

  const invalid = [
    ['a missing name', { name: '   ' }, 'Please enter an event name.'],
    ['a name over 60 characters', { name: 'a'.repeat(61) }, 'Event name must be 60 characters or fewer.'],
    ['a missing start date', { startDate: '' }, 'Please choose a date.'],
    ['an impossible date', { startDate: '2099-02-30' }, 'Please choose a valid date.'],
    ['a past start date', { startDate: '2020-01-01', endDate: '2020-01-01' }, "The event can't start in the past."],
    ['an end before the start', { endDate: '2099-11-24' }, 'The end date must be on or after the start date.'],
    ['an unknown type', { type: 'rave' }, /type/]
  ];
  for (const [label, overrides, message] of invalid) {
    it(`rejects ${label}`, async () => {
      const { auth } = await registerUser();
      const res = await createEvent(auth, overrides).expect(400);

      if (message instanceof RegExp) assert.match(res.body.message, message);
      else assert.equal(res.body.message, message);
    });
  }

  it('requires login', async () => {
    await api().post('/api/events').send(newEvent).expect(401);
  });
});

describe('GET /api/events', () => {
  it("lists only the user's own events, soonest first", async () => {
    const me = await registerUser();
    const other = await registerUser();
    await createEvent(me.auth, { name: 'Later', startDate: '2099-12-01', endDate: '2099-12-01' });
    await createEvent(me.auth, { name: 'Sooner', startDate: '2099-06-01', endDate: '2099-06-01' });
    await createEvent(other.auth, { name: 'Not mine' });

    const res = await api().get('/api/events').set('Authorization', me.auth).expect(200);

    assert.deepEqual(res.body.events.map((e) => e.name), ['Sooner', 'Later']);
  });

  it('includes events the user is a member of but did not create', async () => {
    const me = await registerUser();
    const organizer = await registerUser();
    await Event.create({
      name: 'Invited',
      startDate: '2099-01-01',
      endDate: '2099-01-01',
      createdBy: organizer.user._id,
      members: [{ user: me.user._id, name: me.user.name }]
    });

    const res = await api().get('/api/events').set('Authorization', me.auth).expect(200);
    assert.deepEqual(res.body.events.map((e) => e.name), ['Invited']);
  });
});

describe('GET /api/events/:id', () => {
  it('returns an event the user can see', async () => {
    const { auth } = await registerUser();
    const { body } = await createEvent(auth);

    const res = await api().get(`/api/events/${body.event._id}`).set('Authorization', auth).expect(200);
    assert.equal(res.body.event.name, 'Friendsgiving');
  });

  it("returns 404 for someone else's event", async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const { body } = await createEvent(owner.auth);

    await api().get(`/api/events/${body.event._id}`).set('Authorization', stranger.auth).expect(404);
  });

  it('returns 404 for a malformed id', async () => {
    const { auth } = await registerUser();
    await api().get('/api/events/not-an-id').set('Authorization', auth).expect(404);
  });
});

describe('PATCH /api/events/:id', () => {
  it('lets the organizer edit the event', async () => {
    const { auth } = await registerUser();
    const { body } = await createEvent(auth);

    const res = await api()
      .patch(`/api/events/${body.event._id}`)
      .set('Authorization', auth)
      .send({ name: 'Renamed' })
      .expect(200);
    assert.equal(res.body.event.name, 'Renamed');
  });

  it('ignores fields that are not editable', async () => {
    const { auth, user } = await registerUser();
    const other = await registerUser();
    const { body } = await createEvent(auth);

    const res = await api()
      .patch(`/api/events/${body.event._id}`)
      .set('Authorization', auth)
      .send({ createdBy: other.user._id, members: [] })
      .expect(200);
    assert.equal(res.body.event.createdBy, user._id);
    assert.equal(res.body.event.members.length, 1);
  });

  it('allows editing an event that already started', async () => {
    const { auth, user } = await registerUser();
    const past = await Event.create({ name: 'Past', startDate: '2020-01-01', endDate: '2020-01-02', createdBy: user._id });

    await api().patch(`/api/events/${past._id}`).set('Authorization', auth).send({ name: 'Renamed' }).expect(200);
  });

  it('rejects moving the start date into the past', async () => {
    const { auth } = await registerUser();
    const { body } = await createEvent(auth);

    const res = await api()
      .patch(`/api/events/${body.event._id}`)
      .set('Authorization', auth)
      .send({ startDate: '2020-01-01' })
      .expect(400);
    assert.equal(res.body.message, "The event can't start in the past.");
  });

  it('forbids members who are not the organizer', async () => {
    const member = await registerUser();
    const organizer = await registerUser();
    const event = await Event.create({
      name: 'Shared',
      startDate: '2099-01-01',
      endDate: '2099-01-01',
      createdBy: organizer.user._id,
      members: [{ user: member.user._id, name: member.user.name }]
    });

    await api().patch(`/api/events/${event._id}`).set('Authorization', member.auth).send({ name: 'Hijacked' }).expect(403);
  });
});

describe('DELETE /api/events/:id', () => {
  it('lets the organizer delete the event', async () => {
    const { auth } = await registerUser();
    const { body } = await createEvent(auth);

    await api().delete(`/api/events/${body.event._id}`).set('Authorization', auth).expect(204);
    await api().get(`/api/events/${body.event._id}`).set('Authorization', auth).expect(404);
  });

  it("can't delete someone else's event", async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const { body } = await createEvent(owner.auth);

    await api().delete(`/api/events/${body.event._id}`).set('Authorization', stranger.auth).expect(404);
    await api().get(`/api/events/${body.event._id}`).set('Authorization', owner.auth).expect(200);
  });
});

describe('general API behavior', () => {
  it('returns JSON 404 for unknown routes', async () => {
    const res = await api().get('/api/nope').expect(404);
    assert.deepEqual(res.body, { message: 'Not found.' });
  });

  it('returns 400 for malformed JSON', async () => {
    const { auth } = await registerUser();
    await api()
      .post('/api/events')
      .set('Authorization', auth)
      .set('Content-Type', 'application/json')
      .send('{"name": ')
      .expect(400);
  });
});
