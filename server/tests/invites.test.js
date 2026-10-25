const { useTestDatabase, api, registerUser, assertFields } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const Event = require('../src/models/Event');
const { seedDemoData, DEMO_FRIENDS } = require('../src/seed/demoData');

useTestDatabase();

// An event created through the API by its organizer
const setup = async () => {
  const organizer = await registerUser();
  const res = await api()
    .post('/api/events')
    .set('Authorization', organizer.auth)
    .send({ name: 'Friendsgiving', startDate: '2099-11-25', endDate: '2099-11-27', location: 'Atlanta' })
    .expect(201);
  return { organizer, event: res.body.event };
};

const preview = (auth, code) => api().get(`/api/invites/${code}`).set('Authorization', auth);
const join = (auth, code) => api().post(`/api/invites/${code}/join`).set('Authorization', auth);

describe('GET /api/invites/:code', () => {
  it('shows a preview of the event to someone who is not a member', async () => {
    const { organizer, event } = await setup();
    const friend = await registerUser();

    const res = await preview(friend.auth, event.inviteCode).expect(200);
    assert.deepEqual(res.body.invite, {
      eventId: event._id,
      name: 'Friendsgiving',
      type: 'music-festival',
      startDate: '2099-11-25',
      endDate: '2099-11-27',
      location: 'Atlanta',
      organizerName: organizer.user.name,
      memberCount: 1,
      isMember: false,
      isRemoved: false
    });
  });

  it('does not reveal the schedule or member names', async () => {
    const { event } = await setup();
    const friend = await registerUser();

    const res = await preview(friend.auth, event.inviteCode).expect(200);
    assert.equal('schedule' in res.body.invite, false);
    assert.equal('members' in res.body.invite, false);
  });

  it('tells members they are already in', async () => {
    const { organizer, event } = await setup();
    const res = await preview(organizer.auth, event.inviteCode).expect(200);

    assert.equal(res.body.invite.isMember, true);
  });

  it('requires login', async () => {
    const { event } = await setup();
    await api().get(`/api/invites/${event.inviteCode}`).expect(401);
  });

  it('returns 404 for an unknown code', async () => {
    const friend = await registerUser();
    const res = await preview(friend.auth, 'not-a-real-code').expect(404);

    assert.equal(res.body.message, "This invite link isn't valid anymore. Ask for a new one.");
  });
});

describe('POST /api/invites/:code/join', () => {
  it('adds you as a member and returns the event', async () => {
    const { event } = await setup();
    const friend = await registerUser();

    const res = await join(friend.auth, event.inviteCode).expect(200);
    const members = res.body.event.members;

    assert.equal(members.length, 2);
    assertFields(members[1], { user: friend.user._id, name: friend.user.name });
    assert.match(members[1].color, /^#[0-9a-f]{6}$/);
  });

  it('lets a joined friend see the event and use its schedule', async () => {
    const { event } = await setup();
    const friend = await registerUser();
    await join(friend.auth, event.inviteCode).expect(200);

    const list = await api().get('/api/events').set('Authorization', friend.auth).expect(200);
    assert.deepEqual(list.body.events.map((e) => e.name), ['Friendsgiving']);

    await api()
      .post(`/api/events/${event._id}/schedule`)
      .set('Authorization', friend.auth)
      .send({ date: '2099-11-25', startTime: '18:00', activity: 'Dinner' })
      .expect(201);
  });

  it('only adds you once when you join twice', async () => {
    const { event } = await setup();
    const friend = await registerUser();

    await join(friend.auth, event.inviteCode).expect(200);
    const res = await join(friend.auth, event.inviteCode).expect(200);
    assert.equal(res.body.event.members.length, 2);
  });

  it('only adds you once when two joins arrive at the same moment', async () => {
    const { event } = await setup();
    const friend = await registerUser();

    await Promise.all([join(friend.auth, event.inviteCode), join(friend.auth, event.inviteCode)]);

    const stored = await Event.findById(event._id);
    assert.equal(stored.members.length, 2);
  });

  it("doesn't change anything for the organizer", async () => {
    const { organizer, event } = await setup();
    const res = await join(organizer.auth, event.inviteCode).expect(200);

    assert.equal(res.body.event.members.length, 1);
  });

  it('returns 404 for an unknown code', async () => {
    const friend = await registerUser();
    await join(friend.auth, 'not-a-real-code').expect(404);
  });

  it('requires login', async () => {
    const { event } = await setup();
    await api().post(`/api/invites/${event.inviteCode}/join`).expect(401);
  });
});

describe('POST /api/events/:id/invite/reset', () => {
  it('gives the event a new code and retires the old link', async () => {
    const { organizer, event } = await setup();
    const friend = await registerUser();

    const res = await api().post(`/api/events/${event._id}/invite/reset`).set('Authorization', organizer.auth).expect(200);

    assert.notEqual(res.body.event.inviteCode, event.inviteCode);
    await join(friend.auth, event.inviteCode).expect(404);
    await join(friend.auth, res.body.event.inviteCode).expect(200);
  });

  it('is organizer-only', async () => {
    const { event } = await setup();
    const friend = await registerUser();
    await join(friend.auth, event.inviteCode);

    await api().post(`/api/events/${event._id}/invite/reset`).set('Authorization', friend.auth).expect(403);
  });
});

describe('invite codes', () => {
  it('are different for every event', async () => {
    const { organizer } = await setup();
    const codes = new Set();
    for (let i = 0; i < 20; i += 1) {
      const res = await api()
        .post('/api/events')
        .set('Authorization', organizer.auth)
        .send({ name: `Event ${i}`, startDate: '2099-01-01', endDate: '2099-01-01' });
      codes.add(res.body.event.inviteCode);
    }
    assert.equal(codes.size, 20);
  });
});

describe('demo friends', () => {
  it('are real accounts that can log in', async () => {
    await seedDemoData();

    for (const friend of DEMO_FRIENDS) {
      const res = await api().post('/api/auth/login').send({ email: friend.email, password: 'password' }).expect(200);
      assert.equal(res.body.user.name, friend.name);
    }
  });

  it('see the demo events they belong to', async () => {
    await seedDemoData();
    const login = await api().post('/api/auth/login').send({ email: 'casey@example.com', password: 'password' });

    const res = await api().get('/api/events').set('Authorization', `Bearer ${login.body.token}`).expect(200);
    assert.deepEqual(res.body.events.map((e) => e.name), ['Hiking Trip']);
  });
});
