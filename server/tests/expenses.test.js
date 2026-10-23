const { useTestDatabase, api, registerUser, assertFields } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const Expense = require('../src/models/Expense');
const Payment = require('../src/models/Payment');
const { seedDemoData, DEMO_EVENT_IDS } = require('../src/seed/demoData');

useTestDatabase();

// An event with an organizer and a member who joined by invite, plus an
// outsider who isn't in it
const setup = async () => {
  const organizer = await registerUser();
  const member = await registerUser();
  const outsider = await registerUser();
  const { body } = await api()
    .post('/api/events')
    .set('Authorization', organizer.auth)
    .send({ name: 'Trip', startDate: '2099-06-01', endDate: '2099-06-03' })
    .expect(201);
  await api().post(`/api/invites/${body.event.inviteCode}/join`).set('Authorization', member.auth).expect(200);
  return { organizer, member, outsider, eventId: body.event._id };
};

const ledgerPath = (eventId, ...rest) => ['/api/events', eventId, 'expenses', ...rest].join('/');
const paymentsPath = (eventId, ...rest) => ['/api/events', eventId, 'payments', ...rest].join('/');

// $100 dinner paid by the organizer, split evenly between the two
const dinner = (organizer, member, overrides = {}) => ({
  description: 'Dinner',
  amountCents: 10000,
  date: '2099-06-01',
  paidBy: organizer.user._id,
  splitType: 'equal',
  shares: [
    { user: organizer.user._id, amountCents: 5000 },
    { user: member.user._id, amountCents: 5000 }
  ],
  ...overrides
});

const addExpense = (auth, eventId, body) => api().post(ledgerPath(eventId)).set('Authorization', auth).send(body);

describe('POST /api/events/:id/expenses', () => {
  it('lets any member add an expense, filling in names', async () => {
    const { organizer, member, eventId } = await setup();
    const res = await addExpense(member.auth, eventId, dinner(organizer, member)).expect(201);

    assertFields(res.body.expense, { description: 'Dinner', amountCents: 10000, splitType: 'equal', createdBy: member.user._id });
    assert.deepEqual(res.body.expense.paidBy, { user: organizer.user._id, name: organizer.user.name });
    assert.deepEqual(res.body.expense.shares.map((s) => s.name), [organizer.user.name, member.user.name]);
  });

  it('accepts exact amounts that add up to the total', async () => {
    const { organizer, member, eventId } = await setup();
    const shares = [
      { user: organizer.user._id, amountCents: 7001 },
      { user: member.user._id, amountCents: 2999 }
    ];
    await addExpense(member.auth, eventId, dinner(organizer, member, { splitType: 'exact', shares })).expect(201);
  });

  it('allows someone to have a $0 share', async () => {
    const { organizer, member, eventId } = await setup();
    const shares = [
      { user: organizer.user._id, amountCents: 10000 },
      { user: member.user._id, amountCents: 0 }
    ];
    await addExpense(member.auth, eventId, dinner(organizer, member, { splitType: 'exact', shares })).expect(201);
  });

  const invalid = [
    ['a missing description', { description: ' ' }, 'Please describe the expense.'],
    ['a $0 amount', { amountCents: 0 }, 'Please enter an amount over $0.'],
    ['fractional cents', { amountCents: 100.5 }, 'Please enter an amount over $0.'],
    ['an amount sent as text', { amountCents: '10000' }, 'Please enter an amount over $0.'],
    ['an amount over $100,000', { amountCents: 10000001 }, 'That amount is too large.'],
    ['a missing date', { date: '' }, 'Please choose a date.'],
    ['an unknown split type', { splitType: 'percent' }, 'Please choose how to split it.'],
    ['no one to split with', { shares: [] }, 'Please choose who to split it with.'],
    ['shares that fall short', { shares: [], fix: 'short' }, 'The split must add up to the total.'],
    ['a negative share', { fix: 'negative' }, 'Split amounts must be $0 or more.'],
    ['the same person twice', { fix: 'duplicate' }, 'Each person can only appear once in the split.']
  ];
  for (const [label, overrides, message] of invalid) {
    it(`rejects ${label}`, async () => {
      const { organizer, member, eventId } = await setup();
      const { fix, ...rest } = overrides;
      const body = dinner(organizer, member, rest);
      if (fix === 'short') body.shares = [{ user: organizer.user._id, amountCents: 5000 }];
      if (fix === 'negative') body.shares = [
        { user: organizer.user._id, amountCents: 11000 },
        { user: member.user._id, amountCents: -1000 }
      ];
      if (fix === 'duplicate') body.shares = [
        { user: member.user._id, amountCents: 5000 },
        { user: member.user._id, amountCents: 5000 }
      ];

      const res = await addExpense(member.auth, eventId, body).expect(400);
      assert.equal(res.body.message, message);
    });
  }

  it('rejects a payer who is not in the event', async () => {
    const { organizer, member, outsider, eventId } = await setup();
    const res = await addExpense(member.auth, eventId, dinner(organizer, member, { paidBy: outsider.user._id })).expect(400);

    assert.equal(res.body.message, 'The person who paid must be in the event.');
  });

  it('rejects splitting with someone who is not in the event', async () => {
    const { organizer, member, outsider, eventId } = await setup();
    const shares = [
      { user: organizer.user._id, amountCents: 5000 },
      { user: outsider.user._id, amountCents: 5000 }
    ];
    const res = await addExpense(member.auth, eventId, dinner(organizer, member, { shares })).expect(400);

    assert.equal(res.body.message, 'Everyone in the split must be in the event.');
  });

  it("returns 404 for an event you're not in", async () => {
    const { organizer, member, outsider, eventId } = await setup();
    await addExpense(outsider.auth, eventId, dinner(organizer, member)).expect(404);
  });
});

describe('GET /api/events/:id/expenses', () => {
  it('returns expenses and payments, newest first', async () => {
    const { organizer, member, eventId } = await setup();
    await addExpense(member.auth, eventId, dinner(organizer, member, { description: 'Older', date: '2099-06-01' }));
    await addExpense(member.auth, eventId, dinner(organizer, member, { description: 'Newer', date: '2099-06-02' }));
    await api()
      .post(paymentsPath(eventId))
      .set('Authorization', member.auth)
      .send({ from: member.user._id, to: organizer.user._id, amountCents: 5000, date: '2099-06-03' });

    const res = await api().get(ledgerPath(eventId)).set('Authorization', member.auth).expect(200);

    assert.deepEqual(res.body.expenses.map((e) => e.description), ['Newer', 'Older']);
    assert.equal(res.body.payments.length, 1);
  });

  it("is hidden from people who aren't in the event", async () => {
    const { outsider, eventId } = await setup();
    await api().get(ledgerPath(eventId)).set('Authorization', outsider.auth).expect(404);
  });
});

describe('changing an expense', () => {
  const addAs = async (who) => {
    const ctx = await setup();
    const { body } = await addExpense(ctx[who].auth, ctx.eventId, dinner(ctx.organizer, ctx.member)).expect(201);
    return { ...ctx, expenseId: body.expense._id };
  };

  it('lets whoever added it edit it', async () => {
    const { organizer, member, eventId, expenseId } = await addAs('member');
    const res = await api()
      .patch(ledgerPath(eventId, expenseId))
      .set('Authorization', member.auth)
      .send(dinner(organizer, member, { description: 'Fancy dinner' }))
      .expect(200);

    assert.equal(res.body.expense.description, 'Fancy dinner');
  });

  it('lets the organizer edit anyone\'s expense', async () => {
    const { organizer, member, eventId, expenseId } = await addAs('member');
    await api()
      .patch(ledgerPath(eventId, expenseId))
      .set('Authorization', organizer.auth)
      .send(dinner(organizer, member, { description: 'Fixed' }))
      .expect(200);
  });

  it('stops other members from editing or deleting it', async () => {
    const { organizer, member, eventId, expenseId } = await addAs('organizer');

    const edit = await api()
      .patch(ledgerPath(eventId, expenseId))
      .set('Authorization', member.auth)
      .send(dinner(organizer, member, { amountCents: 1, shares: [{ user: member.user._id, amountCents: 1 }] }))
      .expect(403);
    assert.equal(edit.body.message, 'Only the person who added this, or the organizer, can change it.');
    await api().delete(ledgerPath(eventId, expenseId)).set('Authorization', member.auth).expect(403);
  });

  it('validates edits like new expenses', async () => {
    const { organizer, member, eventId, expenseId } = await addAs('member');
    await api()
      .patch(ledgerPath(eventId, expenseId))
      .set('Authorization', member.auth)
      .send(dinner(organizer, member, { amountCents: 9999 }))
      .expect(400);
  });

  it('lets whoever added it delete it', async () => {
    const { member, eventId, expenseId } = await addAs('member');
    await api().delete(ledgerPath(eventId, expenseId)).set('Authorization', member.auth).expect(204);

    assert.equal(await Expense.countDocuments(), 0);
  });

  it("can't reach an expense through a different event", async () => {
    const { expenseId } = await addAs('member');
    const other = await setup();
    await api().delete(ledgerPath(other.eventId, expenseId)).set('Authorization', other.organizer.auth).expect(404);
  });
});

describe('payments', () => {
  const pay = (auth, eventId, body) => api().post(paymentsPath(eventId)).set('Authorization', auth).send(body);

  it('records a payment you made', async () => {
    const { organizer, member, eventId } = await setup();
    const res = await pay(member.auth, eventId, {
      from: member.user._id, to: organizer.user._id, amountCents: 5000, date: '2099-06-03'
    }).expect(201);

    assertFields(res.body.payment, { amountCents: 5000, createdBy: member.user._id });
    assert.equal(res.body.payment.to.name, organizer.user.name);
  });

  it('records a payment you received', async () => {
    const { organizer, member, eventId } = await setup();
    await pay(organizer.auth, eventId, {
      from: member.user._id, to: organizer.user._id, amountCents: 5000, date: '2099-06-03'
    }).expect(201);
  });

  it("won't record a payment between two other people", async () => {
    const { organizer, member, eventId } = await setup();
    const third = await registerUser();
    const { body } = await api().get(`/api/events/${eventId}`).set('Authorization', organizer.auth);
    await api().post(`/api/invites/${body.event.inviteCode}/join`).set('Authorization', third.auth);

    const res = await pay(third.auth, eventId, {
      from: member.user._id, to: organizer.user._id, amountCents: 5000, date: '2099-06-03'
    }).expect(400);
    assert.equal(res.body.message, 'You can only record payments you made or received.');
  });

  it('rejects paying yourself', async () => {
    const { member, eventId } = await setup();
    const res = await pay(member.auth, eventId, {
      from: member.user._id, to: member.user._id, amountCents: 5000, date: '2099-06-03'
    }).expect(400);
    assert.equal(res.body.message, 'A payment needs two different people.');
  });

  it('lets whoever recorded it delete it, but not other members', async () => {
    const { organizer, member, eventId } = await setup();
    const { body } = await pay(member.auth, eventId, {
      from: member.user._id, to: organizer.user._id, amountCents: 5000, date: '2099-06-03'
    });
    const third = await registerUser();
    const { body: eventBody } = await api().get(`/api/events/${eventId}`).set('Authorization', organizer.auth);
    await api().post(`/api/invites/${eventBody.event.inviteCode}/join`).set('Authorization', third.auth);

    await api().delete(paymentsPath(eventId, body.payment._id)).set('Authorization', third.auth).expect(403);
    await api().delete(paymentsPath(eventId, body.payment._id)).set('Authorization', member.auth).expect(204);
  });
});

describe('budget', () => {
  const setBudget = (auth, eventId, budgetCents) =>
    api().patch(`/api/events/${eventId}`).set('Authorization', auth).send({ budgetCents });

  it('lets the organizer set and clear it', async () => {
    const { organizer, eventId } = await setup();

    assert.equal((await setBudget(organizer.auth, eventId, 85000).expect(200)).body.event.budgetCents, 85000);
    assert.equal((await setBudget(organizer.auth, eventId, null).expect(200)).body.event.budgetCents, null);
  });

  it('rejects an invalid budget', async () => {
    const { organizer, eventId } = await setup();
    await setBudget(organizer.auth, eventId, -5).expect(400);
    await setBudget(organizer.auth, eventId, 10.5).expect(400);
  });

  it('is organizer-only', async () => {
    const { member, eventId } = await setup();
    await setBudget(member.auth, eventId, 85000).expect(403);
  });
});

describe('deleting an event', () => {
  it('deletes its expenses and payments too', async () => {
    const { organizer, member, eventId } = await setup();
    await addExpense(member.auth, eventId, dinner(organizer, member));
    await api()
      .post(paymentsPath(eventId))
      .set('Authorization', member.auth)
      .send({ from: member.user._id, to: organizer.user._id, amountCents: 5000, date: '2099-06-03' });

    await api().delete(`/api/events/${eventId}`).set('Authorization', organizer.auth).expect(204);

    assert.equal(await Expense.countDocuments(), 0);
    assert.equal(await Payment.countDocuments(), 0);
  });
});

describe('demo ledger', () => {
  it('seeds festival expenses whose shares add up', async () => {
    await seedDemoData();
    const expenses = await Expense.find({ event: DEMO_EVENT_IDS.festival });

    assert.equal(expenses.length, 3);
    for (const expense of expenses) {
      const total = expense.shares.reduce((sum, s) => sum + s.amountCents, 0);
      assert.equal(total, expense.amountCents, expense.description);
    }
    assert.equal(await Payment.countDocuments({ event: DEMO_EVENT_IDS.festival }), 1);
  });
});
