const express = require('express');
const Event = require('../models/Event');
const { newInviteCode } = require('../models/Event');
const { ORGANIZER_COLOR } = require('../colors');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../errors');
const { validateEventFields, validateNewEvent, text } = require('../validation');
const { visibleTo, findVisibleEvent, findOwnEvent } = require('../eventAccess');
const scheduleRoutes = require('./schedule');

const router = express.Router();
router.use(requireAuth);
router.use('/:id/schedule', scheduleRoutes);

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

  // An event that already started can still be edited, so the "not in the
  // past" rule only applies when the start date itself changes
  const error = event.isModified('startDate')
    ? validateNewEvent(event)
    : validateEventFields(event);
  if (error) throw new HttpError(400, error);

  await event.save();
  res.json({ event });
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
  await event.deleteOne();
  res.status(204).end();
});

module.exports = router;
