// /api/events/:id/live: finding each other during an event.
//
// Members choose to share where they are for a while (up to 24 hours at a
// time); their phone then sends its position as it moves. Everyone in the
// event sees the others who are sharing, and a meetup point anyone can set.
// Only the latest position is stored, and sharing ends on its own.
const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const LocationShare = require('../models/LocationShare');
const { HttpError } = require('../errors');
const { text } = require('../validation');
const { findVisibleEvent } = require('../eventAccess');
const { TIME } = require('../models/Event');
const { isTest } = require('../config');
const realtime = require('../realtime/hub');
const { record } = require('../activityLog');

const MAX_SHARE_MS = 24 * 60 * 60 * 1000;
// A fix older than this is too stale to show as where someone is
const MAX_FIX_AGE_MS = 2 * 60 * 1000;
const MEETUP_LIFETIME_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_COLOR = '#64748b';
const NOT_SHARING = "You're not sharing your location right now.";

// Phones send a position every so often while moving; this is far above
// that, and only stops a misbehaving client
const positionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: (req) => req.user._id.toString(),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
  message: { message: 'Too many location updates. Try again in a minute.' }
});

// Event dates are local calendar days and the server doesn't know the
// user's time zone, so "happening" allows a day either side in UTC. The app
// only offers sharing while the event is on in the phone's own time zone.
const isHappening = (event, now = new Date()) => {
  const utcDay = (offset) => new Date(now.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
  return event.startDate <= utcDay(1) && event.endDate >= utcDay(-1);
};

// A meetup point is about today, so it lasts 12 hours. One planned before
// the event starts lasts through the event's first day instead. That day
// ends last in UTC-12, at noon UTC the next day.
const meetupExpiry = (event, now) => {
  const firstDayEnds = new Date(`${event.startDate}T12:00:00Z`).getTime() + DAY_MS;
  return new Date(Math.max(now.getTime() + MEETUP_LIFETIME_MS, firstDayEnds));
};

const isCoordinate = (value, limit) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

// ~1 m: enough to find someone in a crowd
const round = (n) => Math.round(n * 100000) / 100000;

const activeShares = (event) => LocationShare.find({ event: event._id, until: { $gt: new Date() } });

const currentMeetup = (event) =>
  event.meetup && event.meetup.expiresAt > new Date()
    ? {
        lat: event.meetup.lat,
        lng: event.meetup.lng,
        note: event.meetup.note,
        time: event.meetup.time,
        setBy: event.meetup.setBy,
        setAt: event.meetup.setAt
      }
    : null;

const router = express.Router({ mergeParams: true });

// -> { sharing: { id, until, seq } | null, people: [{ user, share, name, color,
//      lat, lng, accuracy, positionAt, until }], meetup, now }
// people is everyone else who's sharing and has sent a position. id and share
// name a share, which ends when sharing does, so a phone can tell a fix meant
// for its old share from one for its new one. seq is the last fix number
// stored, so a phone that lost count (reinstalled, or another device) can
// carry on above it rather than have every fix dropped as out of date.
const sharingOf = (share) => ({ id: share._id.toString(), until: share.until, seq: share.seq || 0 });
router.get('/', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const shares = await activeShares(event);
  const mine = shares.find((s) => s.user.equals(req.user._id));

  const people = shares
    .filter((s) => !s.user.equals(req.user._id) && s.lat !== null)
    .map((s) => {
      const member = event.members.find((m) => m.user.equals(s.user));
      return {
        user: s.user,
        share: s._id.toString(),
        name: member?.name || 'Former member',
        color: member?.color || FALLBACK_COLOR,
        lat: s.lat,
        lng: s.lng,
        accuracy: s.accuracy,
        positionAt: s.positionAt,
        until: s.until
      };
    })
    // Freshest first
    .sort((a, b) => b.positionAt - a.positionAt);

  // now lets a phone with a wrong clock still count "8 s ago" correctly
  res.json({ sharing: mine ? sharingOf(mine) : null, people, meetup: currentMeetup(event), now: Date.now() });
});

// Start sharing, or change until when. Body: { until: ISO time }
router.put('/share', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  if (!isHappening(event)) {
    throw new HttpError(409, 'You can share your location while the event is happening.');
  }

  const until = new Date(typeof req.body.until === 'string' ? req.body.until : NaN);
  const now = Date.now();
  if (Number.isNaN(until.getTime()) || until.getTime() <= now) {
    throw new HttpError(400, 'Choose how long to share.');
  }
  if (until.getTime() - now > MAX_SHARE_MS + 60 * 1000) {
    throw new HttpError(400, 'You can share for up to 24 hours at a time.');
  }

  // Starting to share is news; changing until when isn't. A share that ran
  // out stays in the database until MongoDB's next sweep (about a minute),
  // so clear it first, so a restart doesn't bring back where the phone was
  // before. A start is there being no live share before this one (checked
  // again, as one could run out in between). The unique { event, user }
  // index means two taps at once still make one share, and only one of them
  // sees none before it.
  const key = { event: event._id, user: req.user._id };
  await LocationShare.deleteOne({ ...key, until: { $lte: new Date() } });
  // The share's id comes back either way: from the old document when there
  // was one, or from the insert when this made it
  const { value: before, lastErrorObject } = await LocationShare.findOneAndUpdate(
    key,
    { $set: { until } },
    { upsert: true, returnDocument: 'before', includeResultMetadata: true }
  );
  const id = (before?._id || lastErrorObject.upserted).toString();
  // Extending keeps the share, and its count of fixes, going
  const seq = before && before.until > new Date() ? before.seq || 0 : 0;
  if (!before || before.until <= new Date()) {
    await record(event, req.user, 'sharing_started');
    // The map hears about every share change; the event page only needs
    // to hear about this one
    realtime.notifyEvent(event._id, 'event');
  }
  res.json({ sharing: { id, until, seq } });
});

router.delete('/share', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  await LocationShare.deleteOne({ event: event._id, user: req.user._id });
  res.status(204).end();
});

// Body: { lat, lng, accuracy?, shareId?, seq?, ageMs? }. Only while sharing.
//
// shareId, seq and ageMs come all three or none. With them, the phone numbers
// its fixes (seq, one higher each time, per share) and says how old each is
// on its own clock (ageMs), so a fix that arrives late or out of order can
// never replace a newer one, and the phone's time of day is never trusted.
// Without them it's the older, unordered form.
router.put('/position', positionLimiter, async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const receivedAt = Date.now();
  const { lat, lng, accuracy, shareId, seq, ageMs } = req.body;
  if (!isCoordinate(lat, 90) || !isCoordinate(lng, 180)) throw new HttpError(400, 'Invalid location.');
  const meters = typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy) : null;
  const fix = { lat: round(lat), lng: round(lng), accuracy: meters };

  const ordering = [shareId, seq, ageMs].filter((value) => value !== undefined).length;
  if (ordering === 0) {
    // No ordering guarantee: positionAt is when this arrived, and a late
    // request can overwrite a newer one. It's here for older app builds and
    // the demo friends' scripted requests.
    const result = await LocationShare.updateOne(
      { event: event._id, user: req.user._id, until: { $gt: new Date(receivedAt) } },
      { $set: { ...fix, positionAt: new Date(receivedAt), receivedAt: new Date(receivedAt) } }
    );
    // The app stops sending when sharing ends; this catches the stragglers
    if (result.matchedCount === 0) throw new HttpError(409, NOT_SHARING);
    return res.status(204).end();
  }

  if (ordering !== 3) throw new HttpError(400, 'Send the share, number and age together.');
  if (typeof shareId !== 'string' || !mongoose.isValidObjectId(shareId)) throw new HttpError(400, 'Invalid share.');
  if (!Number.isSafeInteger(seq) || seq < 1) throw new HttpError(400, 'Invalid position number.');
  if (typeof ageMs !== 'number' || !Number.isFinite(ageMs) || ageMs < 0) throw new HttpError(400, 'Invalid position age.');

  // Too old to show: nothing is stored, so there's nothing to poke about
  if (ageMs > MAX_FIX_AGE_MS) {
    res.locals.noPoke = true;
    return res.status(204).end();
  }

  const now = new Date(receivedAt);
  const live = { _id: shareId, event: event._id, user: req.user._id, until: { $gt: now } };
  const result = await LocationShare.updateOne(
    { ...live, $or: [{ seq: null }, { seq: { $lt: seq } }] },
    { $set: { ...fix, positionAt: new Date(receivedAt - ageMs), receivedAt: now, seq } }
  );
  if (result.matchedCount === 0) {
    // A live share that wasn't updated has a seq at least this high, so this
    // fix is out of date. Anything else is a share that has ended: stopping
    // deletes the record and a new share gets a new id, so a late fix from
    // the old one can't land in its replacement.
    if (!(await LocationShare.exists(live))) throw new HttpError(409, NOT_SHARING);
    res.locals.noPoke = true;
  }
  res.status(204).end();
});

// Body: { lat, lng, note?, time? ("HH:MM") }. Any member, before or during
// the event; replaces the last.
router.put('/meetup', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const { lat, lng } = req.body;
  const note = text(req.body.note);
  const time = text(req.body.time);
  if (!isCoordinate(lat, 90) || !isCoordinate(lng, 180)) throw new HttpError(400, 'Invalid location.');
  if (note.length > 80) throw new HttpError(400, 'Keep the meetup note under 80 characters.');
  if (time && !TIME.test(time)) throw new HttpError(400, 'Invalid meetup time.');

  const member = event.members.find((m) => m.user.equals(req.user._id));
  const now = new Date();
  event.meetup = {
    lat: round(lat),
    lng: round(lng),
    note,
    time,
    setBy: { user: req.user._id, name: member?.name || req.user.name },
    setAt: now,
    expiresAt: meetupExpiry(event, now)
  };
  await event.save();
  // Just who set it: where, and the note, stay on the map
  await record(event, req.user, 'meetup_set');
  res.json({ meetup: currentMeetup(event) });
});

router.delete('/meetup', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  event.meetup = null;
  await event.save();
  res.status(204).end();
});

module.exports = router;
module.exports.isHappening = isHappening;
