// /api/events/:id/live: finding each other during an event.
//
// Members choose to share where they are for a while (up to 24 hours at a
// time); their phone then sends its position as it moves. Everyone in the
// event sees the others who are sharing, and a meetup point anyone can set.
// Only the latest position is stored, and sharing ends on its own.
const express = require('express');
const rateLimit = require('express-rate-limit');
const LocationShare = require('../models/LocationShare');
const { HttpError } = require('../errors');
const { text } = require('../validation');
const { findVisibleEvent } = require('../eventAccess');
const { TIME } = require('../models/Event');
const { isTest } = require('../config');

const MAX_SHARE_MS = 24 * 60 * 60 * 1000;
const MEETUP_LIFETIME_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_COLOR = '#64748b';

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

// -> { sharing: { until } | null, people: [{ user, name, color, lat, lng,
//      accuracy, positionAt, until }], meetup }
// people is everyone else who's sharing and has sent a position
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

  res.json({ sharing: mine ? { until: mine.until } : null, people, meetup: currentMeetup(event) });
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

  await LocationShare.updateOne(
    { event: event._id, user: req.user._id },
    { $set: { until } },
    { upsert: true }
  );
  res.json({ sharing: { until } });
});

router.delete('/share', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  await LocationShare.deleteOne({ event: event._id, user: req.user._id });
  res.status(204).end();
});

// Body: { lat, lng, accuracy? }. Only while sharing.
router.put('/position', positionLimiter, async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const { lat, lng, accuracy } = req.body;
  if (!isCoordinate(lat, 90) || !isCoordinate(lng, 180)) throw new HttpError(400, 'Invalid location.');
  const meters = typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy) : null;

  const result = await LocationShare.updateOne(
    { event: event._id, user: req.user._id, until: { $gt: new Date() } },
    { $set: { lat: round(lat), lng: round(lng), accuracy: meters, positionAt: new Date() } }
  );
  // The app stops sending when sharing ends; this catches the stragglers
  if (result.matchedCount === 0) throw new HttpError(409, "You're not sharing your location right now.");
  res.status(204).end();
});

// Body: { lat, lng, note?, time? ("HH:MM") }. Any member; replaces the last.
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
    expiresAt: new Date(now.getTime() + MEETUP_LIFETIME_MS)
  };
  await event.save();
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
