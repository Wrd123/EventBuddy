// /api/map: your events as pins. Event locations are free text, so each one
// is looked up on OpenStreetMap the first time the map needs it and saved on
// the event; after that the map loads without any lookups.
const express = require('express');
const Event = require('../models/Event');
const places = require('../discover/places');
const { requireAuth } = require('../middleware/auth');
const { visibleTo } = require('../eventAccess');
const config = require('../config');

// Lookups are throttled to one a second, so a big backlog is spread over a
// few visits to the map instead of making one load slow
const MAX_LOOKUPS_PER_REQUEST = 5;

const router = express.Router();
router.use(requireAuth);

const isCurrent = (event) => event.geo && event.geo.for === event.location;

// -> { events: [{ _id, name, type, coverIndex, startDate, endDate, location, lat, lng }] }
// lat/lng are null for events with no location, or one that couldn't be found
router.get('/events', async (req, res) => {
  const events = await Event.find(visibleTo(req.user)).select('name type coverIndex startDate endDate location geo');

  // All of this visit's lookups share one deadline, so the map answers in
  // time even when the lookup service is slow; whatever's left gets looked
  // up on a later visit
  const deadline = Date.now() + config.lookupDeadlineMs;
  const stale = events.filter((e) => e.location && !isCurrent(e)).slice(0, MAX_LOOKUPS_PER_REQUEST);
  for (const event of stale) {
    if (Date.now() >= deadline) break;
    try {
      const point = await places.geocode(event.location, { deadline });
      event.geo = { for: event.location, lat: point?.lat ?? null, lng: point?.lng ?? null };
      // Just this field, so it can't overwrite an edit made meanwhile
      await Event.updateOne({ _id: event._id, location: event.location }, { $set: { geo: event.geo } });
    } catch {
      // Lookup service down: leave it off the map and try next time
    }
  }

  res.json({
    events: events.map((e) => ({
      _id: e._id,
      name: e.name,
      type: e.type,
      coverIndex: e.coverIndex,
      startDate: e.startDate,
      endDate: e.endDate,
      location: e.location,
      lat: isCurrent(e) ? e.geo.lat : null,
      lng: isCurrent(e) ? e.geo.lng : null
    }))
  });
});

module.exports = router;
