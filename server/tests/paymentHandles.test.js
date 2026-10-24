const { useTestDatabase, api, registerUser } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { seedDemoData, DEMO_EVENT_IDS } = require('../src/seed/demoData');

useTestDatabase();

const saveHandles = (auth, paymentHandles) =>
  api().patch('/api/auth/me').set('Authorization', auth).send({ paymentHandles });

// An event created by `organizer` that `member` joined; `outsider` isn't in it
const setup = async () => {
  const organizer = await registerUser();
  const member = await registerUser();
  const outsider = await registerUser();
  const { body } = await api()
    .post('/api/events')
    .set('Authorization', organizer.auth)
    .send({ name: 'Trip', startDate: '2099-06-01', endDate: '2099-06-01' })
    .expect(201);
  await api().post(`/api/invites/${body.event.inviteCode}/join`).set('Authorization', member.auth).expect(200);
  return { organizer, member, outsider, eventId: body.event._id };
};

const handlesFor = (auth, eventId) =>
  api().get(`/api/events/${eventId}/payment-handles`).set('Authorization', auth);

describe('saving payment handles', () => {
  it('cleans up handles the way people paste them', async () => {
    const { auth } = await registerUser();
    const res = await saveHandles(auth, {
      venmo: '@alex-smith',
      cashapp: '$Alex_S',
      paypal: 'https://paypal.me/alexs/',
      zelle: ' alex@example.com '
    }).expect(200);

    assert.deepEqual({ ...res.body.user.paymentHandles }, {
      venmo: 'alex-smith',
      cashapp: 'Alex_S',
      paypal: 'alexs',
      zelle: 'alex@example.com'
    });
  });

  it('accepts pasted Venmo and Cash App profile links', async () => {
    const { auth } = await registerUser();
    const res = await saveHandles(auth, { venmo: 'https://venmo.com/u/alex-smith', cashapp: 'cash.app/$alex' }).expect(200);

    assert.equal(res.body.user.paymentHandles.venmo, 'alex-smith');
    assert.equal(res.body.user.paymentHandles.cashapp, 'alex');
  });

  it('accepts a US phone number for Zelle', async () => {
    const { auth } = await registerUser();
    await saveHandles(auth, { zelle: '(404) 555-0123' }).expect(200);
    await saveHandles(auth, { zelle: '+1 404.555.0123' }).expect(200);
  });

  it('updates only the handles sent, and clears one with an empty value', async () => {
    const { auth } = await registerUser();
    await saveHandles(auth, { venmo: 'alex-smith', zelle: 'alex@example.com' });
    const res = await saveHandles(auth, { zelle: '' }).expect(200);

    assert.equal(res.body.user.paymentHandles.venmo, 'alex-smith');
    assert.equal(res.body.user.paymentHandles.zelle, '');
  });

  it("doesn't require the name when only handles change", async () => {
    const { auth, user } = await registerUser();
    const res = await saveHandles(auth, { venmo: 'alex-smith' }).expect(200);

    assert.equal(res.body.user.name, user.name);
  });

  const invalid = [
    ['a Venmo name that is too short', { venmo: 'abc' }, 'Venmo usernames are 5-30 letters, numbers, dashes or underscores.'],
    ['a Venmo name with spaces', { venmo: 'alex smith' }, 'Venmo usernames are 5-30 letters, numbers, dashes or underscores.'],
    ['a $cashtag with only numbers', { cashapp: '$12345' }, 'Cash App $cashtags are up to 20 letters, numbers or underscores.'],
    ['a PayPal.Me name with symbols', { paypal: 'alex-s' }, 'PayPal.Me names are up to 20 letters or numbers.'],
    ['a Zelle value that is neither email nor phone', { zelle: 'alex' }, 'For Zelle, enter the email or US phone number your bank uses.']
  ];
  for (const [label, handles, message] of invalid) {
    it(`rejects ${label}`, async () => {
      const { auth } = await registerUser();
      const res = await saveHandles(auth, handles).expect(400);
      assert.equal(res.body.message, message);
    });
  }

  it('rejects a malformed request', async () => {
    const { auth } = await registerUser();
    await saveHandles(auth, 'venmo').expect(400);
  });
});

describe('GET /api/events/:id/payment-handles', () => {
  it("shows co-members' handles", async () => {
    const { organizer, member, eventId } = await setup();
    await saveHandles(organizer.auth, { venmo: 'alex-smith', zelle: 'alex@example.com' });

    const res = await handlesFor(member.auth, eventId).expect(200);

    assert.deepEqual(res.body.handles, [{
      user: organizer.user._id,
      name: organizer.user.name,
      venmo: 'alex-smith',
      cashapp: '',
      paypal: '',
      zelle: 'alex@example.com'
    }]);
  });

  it('leaves out members who have no handles', async () => {
    const { member, eventId } = await setup();
    const res = await handlesFor(member.auth, eventId).expect(200);

    assert.deepEqual(res.body.handles, []);
  });

  it('never includes account details like email or username', async () => {
    const { organizer, member, eventId } = await setup();
    await saveHandles(organizer.auth, { venmo: 'alex-smith' });

    const [entry] = (await handlesFor(member.auth, eventId)).body.handles;
    assert.deepEqual(Object.keys(entry).sort(), ['cashapp', 'name', 'paypal', 'user', 'venmo', 'zelle']);
  });

  it('is hidden from people outside the event', async () => {
    const { organizer, outsider, eventId } = await setup();
    await saveHandles(organizer.auth, { zelle: 'alex@example.com' });

    await handlesFor(outsider.auth, eventId).expect(404);
  });

  it("doesn't show handles from your other events", async () => {
    const { organizer, member, eventId } = await setup();
    const stranger = await registerUser();
    await saveHandles(stranger.auth, { venmo: 'stranger-x' });
    // The organizer shares a different event with the stranger
    const { body } = await api()
      .post('/api/events')
      .set('Authorization', organizer.auth)
      .send({ name: 'Other', startDate: '2099-07-01', endDate: '2099-07-01' });
    await api().post(`/api/invites/${body.event.inviteCode}/join`).set('Authorization', stranger.auth);

    const res = await handlesFor(member.auth, eventId).expect(200);
    assert.equal(res.body.handles.some((h) => h.venmo === 'stranger-x'), false);
  });
});

describe('demo payment handles', () => {
  it('only use reserved example.com Zelle addresses', async () => {
    await seedDemoData();
    const login = await api().post('/api/auth/login').send({ email: 'user@example.com', password: 'password' });
    const res = await handlesFor(`Bearer ${login.body.token}`, DEMO_EVENT_IDS.festival).expect(200);

    assert.ok(res.body.handles.length > 0);
    for (const h of res.body.handles) {
      assert.match(h.zelle, /@example\.com$/);
      assert.equal(h.venmo + h.cashapp + h.paypal, '', `${h.name} should have no real-looking handles`);
    }
  });
});
