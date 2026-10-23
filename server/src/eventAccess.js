// Who may see and change an event. Shared by the event and schedule routes.
const Event = require('./models/Event');
const { HttpError } = require('./errors');

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

module.exports = { visibleTo, findVisibleEvent, findOwnEvent };
