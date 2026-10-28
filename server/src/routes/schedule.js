// /api/events/:id/schedule. Any member of the event can add, edit and
// remove schedule items, and mark themselves going or not. Every response
// is the whole updated event, so the client can just replace its copy.
const express = require('express');
const Event = require('../models/Event');
const { HttpError } = require('../errors');
const { validateScheduleItem, text } = require('../validation');
const { visibleTo, findVisibleEvent } = require('../eventAccess');
const { record, follow, forget } = require('../activityLog');

// mergeParams: see the parent route's :id
const router = express.Router({ mergeParams: true });

const EDITABLE_FIELDS = ['date', 'startTime', 'endTime', 'activity', 'location'];

const pickFields = (body) =>
  Object.fromEntries(EDITABLE_FIELDS.filter((field) => field in body).map((field) => [field, text(body[field])]));

const findItem = (event, itemId) => {
  const item = event.schedule.id(itemId);
  if (!item) throw new HttpError(404, 'Schedule item not found.');
  return item;
};

router.post('/', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const fields = { date: '', startTime: '', endTime: '', activity: '', location: '', ...pickFields(req.body) };

  const error = validateScheduleItem(fields, event);
  if (error) throw new HttpError(400, error);

  const item = event.schedule[event.schedule.push({ ...fields, attendees: [], createdBy: req.user._id }) - 1];
  await event.save();
  await record(event, req.user, 'schedule_added', { subject: item._id, activity: item.activity });
  res.status(201).json({ event });
});

router.patch('/:itemId', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const item = findItem(event, req.params.itemId);

  // Validate the item as it would be after the change
  const updated = {
    date: item.date,
    startTime: item.startTime,
    endTime: item.endTime,
    activity: item.activity,
    location: item.location,
    ...pickFields(req.body)
  };
  const error = validateScheduleItem(updated, event);
  if (error) throw new HttpError(400, error);

  const renamed = updated.activity !== item.activity;
  item.set(updated);
  await event.save();
  if (renamed) await follow(event, item._id, { activity: item.activity });
  res.json({ event });
});

router.delete('/:itemId', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const item = findItem(event, req.params.itemId);
  item.deleteOne();
  await event.save();
  await forget(event, item._id);
  res.json({ event });
});

// Going and not going are single atomic updates rather than load-modify-save,
// so two people tapping "Going" at the same moment can't overwrite each other.
// Both are idempotent: going twice still lists you once.

router.put('/:itemId/going', async (req, res) => {
  const { id, itemId } = req.params;
  const me = req.user;

  await Event.updateOne(
    {
      _id: id,
      ...visibleTo(me),
      // Only match the item if I'm not already on it
      schedule: { $elemMatch: { _id: itemId, 'attendees.user': { $ne: me._id } } }
    },
    { $push: { 'schedule.$.attendees': { user: me._id, name: me.name } } }
  );

  const event = await findVisibleEvent(id, me);
  findItem(event, itemId);
  res.json({ event });
});

router.delete('/:itemId/going', async (req, res) => {
  const { id, itemId } = req.params;
  const me = req.user;

  await Event.updateOne(
    { _id: id, ...visibleTo(me), 'schedule._id': itemId },
    { $pull: { 'schedule.$.attendees': { user: me._id } } }
  );

  const event = await findVisibleEvent(id, me);
  findItem(event, itemId);
  res.json({ event });
});

module.exports = router;
