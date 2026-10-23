const express = require('express');
const Event = require('../models/Event');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../errors');
const { validateEventFields, validateNewEvent, text } = require('../validation');

const router = express.Router();
router.use(requireAuth);

const MEMBER_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899'];
const MAX_INVITES = 50;

// Events a user may see: ones they created or are a member of
const visibleTo = (user) => ({
  $or: [{ createdBy: user._id }, { 'members.user': user._id }]
});

// 404 rather than 403 for events you can't see, so ids of other people's
// events aren't confirmed to exist
const findVisibleEvent = async (id, user) => {
  const event = await Event.findOne({ _id: id, ...visibleTo(user) });
  if (!event) throw new HttpError(404, 'Event not found.');
  return event;
};

const findOwnEvent = async (id, user) => {
  const event = await findVisibleEvent(id, user);
  if (!event.createdBy.equals(user._id)) {
    throw new HttpError(403, 'Only the organizer can change this event.');
  }
  return event;
};

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

  // Invited friends are names until friends are real accounts
  const invited = (Array.isArray(req.body.invitedFriends) ? req.body.invitedFriends : [])
    .map(text)
    .filter(Boolean)
    .slice(0, MAX_INVITES);

  const event = await Event.create({
    ...fields,
    // The creator comes from the login token, and is always the first member
    createdBy: req.user._id,
    members: [
      { user: req.user._id, name: req.user.name, color: '#7c3aed' },
      ...invited.map((name, index) => ({ name, color: MEMBER_COLORS[index % MEMBER_COLORS.length] }))
    ],
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

router.delete('/:id', async (req, res) => {
  const event = await findOwnEvent(req.params.id, req.user);
  await event.deleteOne();
  res.status(204).end();
});

module.exports = router;
