// Recent activity: the short history on an event's page ("Taylor set the
// meetup point"). A line describes a change but is never part of it, so
// writing one can't fail the change or hold it up. A failure is logged and
// dropped, and the route waits only a moment for it. That matters most
// inside the ledger lock (eventLock.js), where a stalled write would hold up
// the event's next payment, and would turn an expense that was saved into
// one the app can't confirm.
const Activity = require('./models/Activity');
const realtime = require('./realtime/hub');
const { isTest } = require('./config');

// How long a change waits for its activity write. It normally takes a few
// milliseconds; tests shorten this to check what happens past it.
const timing = { waitMs: 2000 };

// Runs one activity write for the event. Routes await this before they
// respond, so the poke sent as the response finishes finds the new line.
// A write that lands after the deadline pokes the event itself, so the
// feed still catches up. Accepted: if the thing a late line is about is
// deleted or renamed before the line lands, the line keeps the old version
// (until it's cleared after 30 days). That takes a database stalled for
// seconds and a change inside that window, and costs only a stale line.
const bounded = async (eventId, write) => {
  let late = false;
  const done = Promise.resolve()
    .then(write)
    .then(
      () => { if (late) realtime.notifyEvent(eventId, 'event'); },
      (err) => { if (!isTest) console.error('Activity not saved:', err.message); }
    );
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      late = true;
      resolve();
    }, timing.waitMs);
  });
  await Promise.race([done, deadline]);
  clearTimeout(timer);
};

// The actor as the event knows them: their member name, else their own
const actorOf = (event, user) => {
  const member = event.members.find((m) => m.user.equals(user._id));
  return { user: user._id, name: member?.name || user.name };
};

// A new line. details: { subject, ...what the sentence needs }
const record = (event, user, kind, { subject, ...data } = {}) =>
  bounded(event._id, () => Activity.create({ event: event._id, actor: actorOf(event, user), kind, subject, data }));

// A line follows what it's about: it shows a new title or amount, and goes
// when that does, so the feed never shows a payment that was taken back
const follow = (event, subject, data) => {
  const changes = Object.fromEntries(Object.entries(data).map(([key, value]) => [`data.${key}`, value]));
  return bounded(event._id, () => Activity.updateMany({ event: event._id, subject }, { $set: changes }));
};

const forget = (event, subject) =>
  bounded(event._id, () => Activity.deleteMany({ event: event._id, subject }));

module.exports = { record, follow, forget, timing };
