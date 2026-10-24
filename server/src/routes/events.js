const express = require('express');
const Event = require('../models/Event');
const User = require('../models/User');
const { newInviteCode } = require('../models/Event');
const { ORGANIZER_COLOR } = require('../colors');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../errors');
const { validateEventFields, validateNewEvent, text } = require('../validation');
const { visibleTo, findVisibleEvent, findOwnEvent } = require('../eventAccess');
const scheduleRoutes = require('./schedule');
const { expenses: expenseRoutes, payments: paymentRoutes } = require('./expenses');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const { MAX_CENTS } = require('../models/Expense');

const router = express.Router();
router.use(requireAuth);
router.use('/:id/schedule', scheduleRoutes);
router.use('/:id/expenses', expenseRoutes);
router.use('/:id/payments', paymentRoutes);

router.get('/', async (req, res) => {
  const events = await Event.find(visibleTo(req.user)).sort({ startDate: 1 });
  res.json({ events });
});

router.get('/:id', async (req, res) => {
  res.json({ event: await findVisibleEvent(req.params.id, req.user) });
});

router.post('/', async (req, res) => {
  const fields = {
    name: text(req.body.name),
    type: req.body.type,
    startDate: text(req.body.startDate),
    endDate: text(req.body.endDate),
    location: text(req.body.location),
    description: text(req.body.description)
  };

  const error = validateNewEvent(fields);
  if (error) throw new HttpError(400, error);

  // The creator comes from the login token and starts as the only member;
  // everyone else joins through the invite link
  const event = await Event.create({
    ...fields,
    createdBy: req.user._id,
    members: [{ user: req.user._id, name: req.user.name, color: ORGANIZER_COLOR }],
    schedule: []
  });

  res.status(201).json({ event });
});

const EDITABLE_FIELDS = ['name', 'type', 'startDate', 'endDate', 'location', 'description'];

router.patch('/:id', async (req, res) => {
  const event = await findOwnEvent(req.params.id, req.user);

  // Only copy known fields, so a request can't overwrite createdBy or members
  for (const field of EDITABLE_FIELDS) {
    if (field in req.body) {
      event[field] = field === 'type' ? req.body.type : text(req.body[field]);
    }
  }

  // Whole cents, or null to remove the budget
  if ('budgetCents' in req.body) {
    const budget = req.body.budgetCents;
    if (budget !== null && (!Number.isInteger(budget) || budget < 0 || budget > MAX_CENTS)) {
      throw new HttpError(400, 'Please enter a budget between $0 and $100,000.');
    }
    event.budgetCents = budget;
  }

  // An event that already started can still be edited, so the "not in the
  // past" rule only applies when the start date itself changes
  const error = event.isModified('startDate')
    ? validateNewEvent(event)
    : validateEventFields(event);
  if (error) throw new HttpError(400, error);

  await event.save();
  res.json({ event });
});

// Payment handles for this event's members. Members only (404 otherwise),
// so handles are never visible to strangers. Only people with at least one
// handle are listed, and only their handles, not account details.
router.get('/:id/payment-handles', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const users = await User.find({ _id: { $in: event.members.map((m) => m.user) } }).select('name paymentHandles');
  const handles = users
    .map((u) => ({ user: u._id, name: u.name, ...u.paymentHandles.toObject() }))
    .filter((h) => h.venmo || h.cashapp || h.paypal || h.zelle);
  res.json({ handles });
});

// A new invite code; the old link stops working. Organizer only, so a
// member can't cut everyone else off.
router.post('/:id/invite/reset', async (req, res) => {
  const event = await findOwnEvent(req.params.id, req.user);
  event.inviteCode = newInviteCode();
  await event.save();
  res.json({ event });
});

router.delete('/:id', async (req, res) => {
  const event = await findOwnEvent(req.params.id, req.user);
  // Its money records go with it
  await Promise.all([
    Expense.deleteMany({ event: event._id }),
    Payment.deleteMany({ event: event._id }),
    event.deleteOne()
  ]);
  res.status(204).end();
});

module.exports = router;
