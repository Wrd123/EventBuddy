const { useTestDatabase, api, registerUser, assertFields } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const Expense = require('../src/models/Expense');
const Payment = require('../src/models/Payment');
const { withEventLock } = require('../src/eventLock');
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

describe('retrying an expense', () => {
  const stored = (eventId) => Expense.countDocuments({ event: eventId });

  it('returns the saved expense when a retry repeats its clientId', async () => {
    const { organizer, member, eventId } = await setup();
    const body = dinner(organizer, member, { clientId: 'dinner-tap' });

    const first = await addExpense(member.auth, eventId, body).expect(201);
    const again = await addExpense(member.auth, eventId, body).expect(200);

    assert.equal(again.body.expense._id, first.body.expense._id);
    assert.equal(await stored(eventId), 1);
  });

  it('saves one expense when two tries race', async () => {
    const { organizer, member, eventId } = await setup();
    const body = dinner(organizer, member, { clientId: 'twice' });

    const results = await Promise.all([addExpense(member.auth, eventId, body), addExpense(member.auth, eventId, body)]);

    assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
    assert.equal(results[0].body.expense._id, results[1].body.expense._id);
    assert.equal(await stored(eventId), 1);
  });

  it('refuses a clientId reused for a different expense', async () => {
    const { organizer, member, eventId } = await setup();
    await addExpense(member.auth, eventId, dinner(organizer, member, { clientId: 'reused' })).expect(201);

    const res = await addExpense(member.auth, eventId, dinner(organizer, member, {
      clientId: 'reused',
      amountCents: 12000,
      shares: [{ user: organizer.user._id, amountCents: 6000 }, { user: member.user._id, amountCents: 6000 }]
    })).expect(409);

    assert.equal(res.body.message, 'That request was already used for something else.');
    assert.equal(await stored(eventId), 1);
  });

  it("keeps one person's clientId apart from another's", async () => {
    const { organizer, member, eventId } = await setup();
    const body = dinner(organizer, member, { clientId: 'same-id' });

    await addExpense(member.auth, eventId, body).expect(201);
    await addExpense(organizer.auth, eventId, body).expect(201);

    assert.equal(await stored(eventId), 2);
  });

  it('keeps the same clientId in another event apart', async () => {
    const { organizer, member, eventId } = await setup();
    const { body: other } = await api()
      .post('/api/events')
      .set('Authorization', organizer.auth)
      .send({ name: 'Second trip', startDate: '2099-07-01', endDate: '2099-07-02' })
      .expect(201);
    await api().post(`/api/invites/${other.event.inviteCode}/join`).set('Authorization', member.auth).expect(200);
    const body = dinner(organizer, member, { clientId: 'same-id', date: '2099-07-01' });

    await addExpense(member.auth, eventId, body).expect(201);
    await addExpense(member.auth, other.event._id, body).expect(201);

    assert.equal(await stored(eventId), 1);
    assert.equal(await stored(other.event._id), 1);
  });

  it('adds every expense sent without a clientId, as older apps do', async () => {
    const { organizer, member, eventId } = await setup();

    await addExpense(member.auth, eventId, dinner(organizer, member)).expect(201);
    await addExpense(member.auth, eventId, dinner(organizer, member)).expect(201);

    assert.equal(await stored(eventId), 2);
  });

  it('rejects a clientId that is not a short plain id', async () => {
    const { organizer, member, eventId } = await setup();

    await addExpense(member.auth, eventId, dinner(organizer, member, { clientId: 'has spaces' })).expect(400);
    await addExpense(member.auth, eventId, dinner(organizer, member, { clientId: { $ne: null } })).expect(400);
    assert.equal(await stored(eventId), 0);
  });

  it('refuses a retry once the saved expense was edited, since the app then knows it saved', async () => {
    const { organizer, member, eventId } = await setup();
    const body = dinner(organizer, member, { clientId: 'edited-first' });
    const { body: { expense } } = await addExpense(member.auth, eventId, body).expect(201);
    await api().patch(ledgerPath(eventId, expense._id)).set('Authorization', member.auth)
      .send({ ...body, description: 'Late dinner' }).expect(200);

    await addExpense(member.auth, eventId, body).expect(409);
    assert.equal(await stored(eventId), 1);
  });

  // The deleted record is gone, so a retry that late can't be told from a
  // new expense. Retries follow their original within seconds.
  it('adds a retry again once the saved expense was deleted', async () => {
    const { organizer, member, eventId } = await setup();
    const body = dinner(organizer, member, { clientId: 'deleted-first' });
    const { body: { expense } } = await addExpense(member.auth, eventId, body).expect(201);
    await api().delete(ledgerPath(eventId, expense._id)).set('Authorization', member.auth).expect(204);

    await addExpense(member.auth, eventId, body).expect(201);
    assert.equal(await stored(eventId), 1);
  });

  it('returns a saved retry even after a change that would now refuse it', async () => {
    const { organizer, member, eventId } = await setup();
    const body = dinner(organizer, member, { clientId: 'before-leaving' });
    const first = await addExpense(organizer.auth, eventId, body).expect(201);
    // The member settles up and leaves, so the expense names someone who
    // is no longer in the event, and adding it fresh would be refused
    await api().post(paymentsPath(eventId)).set('Authorization', member.auth)
      .send({ from: member.user._id, to: organizer.user._id, amountCents: 5000, date: '2099-06-01' }).expect(201);
    await api().delete(`/api/events/${eventId}/members/${member.user._id}`).set('Authorization', member.auth).expect(204);
    await addExpense(organizer.auth, eventId, { ...body, clientId: 'fresh' }).expect(400);

    const again = await addExpense(organizer.auth, eventId, body).expect(200);

    assert.equal(again.body.expense._id, first.body.expense._id);
    assert.equal(await stored(eventId), 1);
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
      .send({ from: member.user._id, to: organizer.user._id, amountCents: 5000, date: '2099-06-03' })
      .expect(201);

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

  // The setup plus the $100 dinner, so the member owes the organizer $50
  const setupWithDebt = async () => {
    const context = await setup();
    const { organizer, member, eventId } = context;
    await addExpense(organizer.auth, eventId, dinner(organizer, member)).expect(201);
    return context;
  };
  const settle = (context, overrides = {}) => ({
    from: context.member.user._id, to: context.organizer.user._id, amountCents: 5000, date: '2099-06-03', ...overrides
  });

  it('records a payment you made', async () => {
    const { organizer, member, eventId } = await setupWithDebt();
    const res = await pay(member.auth, eventId, {
      from: member.user._id, to: organizer.user._id, amountCents: 5000, date: '2099-06-03'
    }).expect(201);

    assertFields(res.body.payment, { amountCents: 5000, createdBy: member.user._id });
    assert.equal(res.body.payment.to.name, organizer.user.name);
  });

  it('records a payment you received', async () => {
    const { organizer, member, eventId } = await setupWithDebt();
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
    const { organizer, member, eventId } = await setupWithDebt();
    const { body } = await pay(member.auth, eventId, {
      from: member.user._id, to: organizer.user._id, amountCents: 5000, date: '2099-06-03'
    });
    const third = await registerUser();
    const { body: eventBody } = await api().get(`/api/events/${eventId}`).set('Authorization', organizer.auth);
    await api().post(`/api/invites/${eventBody.event.inviteCode}/join`).set('Authorization', third.auth);

    await api().delete(paymentsPath(eventId, body.payment._id)).set('Authorization', third.auth).expect(403);
    await api().delete(paymentsPath(eventId, body.payment._id)).set('Authorization', member.auth).expect(204);
  });

  it("won't take anyone past even, so a debt can't be marked paid twice", async () => {
    const context = await setupWithDebt();
    const { organizer, member, eventId } = context;
    await pay(member.auth, eventId, settle(context, { clientId: 'payer-tap' })).expect(201);

    // The organizer's screen hadn't caught up and still offered "Mark paid"
    const res = await pay(organizer.auth, eventId, settle(context, { clientId: 'recipient-tap' })).expect(409);
    assert.equal(res.body.message, "That's already settled. Balances have been updated.");
    assert.equal(await Payment.countDocuments(), 1);
  });

  it('records only one when both people mark it paid at the same moment', async () => {
    const context = await setupWithDebt();
    const { organizer, member, eventId } = context;
    const results = await Promise.all([
      pay(member.auth, eventId, settle(context, { clientId: 'payer-tap' })),
      pay(organizer.auth, eventId, settle(context, { clientId: 'recipient-tap' }))
    ]);

    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await Payment.countDocuments(), 1);
  });

  it('returns the saved payment when a retry repeats its clientId, even once settled', async () => {
    const context = await setupWithDebt();
    const { member, eventId } = context;
    const first = await pay(member.auth, eventId, settle(context, { clientId: 'retry-me' })).expect(201);
    const again = await pay(member.auth, eventId, settle(context, { clientId: 'retry-me' })).expect(200);

    assert.equal(again.body.payment._id, first.body.payment._id);
    assert.equal(await Payment.countDocuments(), 1);
  });

  it('records one payment when a retry races the original', async () => {
    const context = await setupWithDebt();
    const { member, eventId } = context;
    const results = await Promise.all([
      pay(member.auth, eventId, settle(context, { clientId: 'twice' })),
      pay(member.auth, eventId, settle(context, { clientId: 'twice' }))
    ]);

    assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
    assert.equal(results[0].body.payment._id, results[1].body.payment._id);
    assert.equal(await Payment.countDocuments(), 1);
  });

  it('rejects a clientId reused for a different payment', async () => {
    const context = await setupWithDebt();
    const { member, eventId } = context;
    await pay(member.auth, eventId, settle(context, { amountCents: 2000, clientId: 'reused' })).expect(201);

    const res = await pay(member.auth, eventId, settle(context, { amountCents: 3000, clientId: 'reused' })).expect(409);
    assert.equal(res.body.message, 'That request was already used for something else.');
  });

  it('rejects a clientId that is blank, too long or not a plain id', async () => {
    const context = await setupWithDebt();
    const { member, eventId } = context;
    for (const clientId of ['', 'x'.repeat(65), 'has spaces', 42]) {
      await pay(member.auth, eventId, settle(context, { clientId })).expect(400);
    }
    assert.equal(await Payment.countDocuments(), 0);
  });

  it('still lets the same two people settle a new debt later', async () => {
    const context = await setupWithDebt();
    const { organizer, member, eventId } = context;
    await pay(member.auth, eventId, settle(context, { clientId: 'first-dinner' })).expect(201);
    await addExpense(organizer.auth, eventId, dinner(organizer, member, { description: 'Second dinner' })).expect(201);

    await pay(member.auth, eventId, settle(context, { clientId: 'second-dinner' })).expect(201);
    assert.equal(await Payment.countDocuments(), 2);
  });

  it('checks a payment against the ledger as it is once any change ahead of it has finished', async () => {
    const context = await setupWithDebt();
    const { member, eventId } = context;
    // Another ledger change is underway: hold the event's lock while it runs
    let finishChange;
    const change = withEventLock(eventId, () => new Promise((resolve) => { finishChange = resolve; }));
    const payment = pay(member.auth, eventId, settle(context)).then((res) => res);

    // Meanwhile the dinner is halved, so the member only owes $25
    await new Promise((resolve) => setTimeout(resolve, 100));
    await Expense.updateOne({ event: eventId }, {
      amountCents: 5000,
      shares: [
        { user: context.organizer.user._id, name: context.organizer.user.name, amountCents: 2500 },
        { user: member.user._id, name: member.user.name, amountCents: 2500 }
      ]
    });
    finishChange();
    await change;

    // Without the lock, the $50 payment would already have been checked
    // against the old $50 debt and saved, leaving the member $25 past even
    assert.equal((await payment).status, 409);
    assert.equal(await Payment.countDocuments(), 0);
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
