const express = require('express');
const Event = require('../models/Event');
const User = require('../models/User');
const { newInviteCode, COVER_PHOTOS_PER_TYPE } = require('../models/Event');
const { ORGANIZER_COLOR } = require('../colors');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../errors');
const { validateEventFields, validateNewEvent, text } = require('../validation');
const { visibleTo, findVisibleEvent, findOwnEvent } = require('../eventAccess');
const scheduleRoutes = require('./schedule');
const { expenses: expenseRoutes, payments: paymentRoutes } = require('./expenses');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const Message = require('../models/Message');
const ChatRead = require('../models/ChatRead');
const messageRoutes = require('./messages');
const liveRoutes = require('./live');
const LocationShare = require('../models/LocationShare');
const { MAX_CENTS } = require('../models/Expense');

const router = express.Router();
router.use(requireAuth);
router.use('/:id/schedule', scheduleRoutes);
router.use('/:id/expenses', expenseRoutes);
router.use('/:id/payments', paymentRoutes);
router.use('/:id/messages', messageRoutes);
router.use('/:id/live', liveRoutes);

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
    description: text(req.body.description),
    ticketUrl: text(req.body.ticketUrl)
  };

  const error = validateNewEvent(fields);
  if (error) throw new HttpError(400, error);

  // The creator comes from the login token and starts as the only member;
  // everyone else joins through the invite link
  const event = new Event({
    ...fields,
    createdBy: req.user._id,
    members: [{ user: req.user._id, name: req.user.name, color: ORGANIZER_COLOR }],
    schedule: []
  });
  await event.validate();
  event.coverIndex = await nextCoverIndex(event);
  await event.save();

  res.status(201).json({ event });
});

// Each organizer's events of a type take that type's cover photos in turn:
// their 1st concert gets photo 1, their 2nd photo 2, and the 11th starts
// over. Counting the events they have now keeps this to one query; after a
// delete, a photo can come around again sooner.
const nextCoverIndex = async (event) => {
  const earlier = await Event.countDocuments({ createdBy: event.createdBy, type: event.type, _id: { $ne: event._id } });
  return earlier % COVER_PHOTOS_PER_TYPE;
};

const EDITABLE_FIELDS = ['name', 'type', 'startDate', 'endDate', 'location', 'description', 'ticketUrl'];

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

  // Shorter dates mustn't strand schedule items on days the event no longer has
  if (event.isModified('startDate') || event.isModified('endDate')) {
    const outside = event.schedule.filter((i) => i.date < event.startDate || i.date > event.endDate).length;
    if (outside > 0) {
      throw new HttpError(400, outside === 1
        ? 'A schedule item is on a day outside the new dates. Move or delete it first.'
        : `${outside} schedule items are on days outside the new dates. Move or delete them first.`);
    }
  }

  // A festival photo shouldn't stay on what's now a ballgame
  if (event.isModified('type')) event.coverIndex = await nextCoverIndex(event);

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
  // Its money records, chat and shared locations go with it
  await Promise.all([
    Expense.deleteMany({ event: event._id }),
    Payment.deleteMany({ event: event._id }),
    Message.deleteMany({ event: event._id }),
    ChatRead.deleteMany({ event: event._id }),
    LocationShare.deleteMany({ event: event._id }),
    event.deleteOne()
  ]);
  res.status(204).end();
});

module.exports = router;
