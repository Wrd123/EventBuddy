// /api/discover: local upcoming events and place lookups for the Discover
// tab. Coordinates are rounded to about 1 km before use (and never stored),
// which is plenty for "events within 25 miles" without pinpointing anyone.
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../errors');
const ticketmaster = require('../discover/ticketmaster');
const places = require('../discover/places');

const router = express.Router();
router.use(requireAuth);

const RADII = [10, 25, 50, 100];
const CATEGORIES = ['all', ...Object.keys(ticketmaster.SEGMENTS)];

const round = (n) => Math.round(n * 100) / 100;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
// Long enough for any trip, short enough to stay a "what's on then" search
const MAX_RANGE_DAYS = 31;

// Optional ?from&to ("YYYY-MM-DD", days at the venue): only events starting
// in that range, e.g. during a trip. {} when not given, or throws a 400.
const dayRange = ({ from, to }) => {
  if (from === undefined && to === undefined) return {};
  const days = (Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000);
  if (!ISO_DAY.test(from || '') || !ISO_DAY.test(to || '') || !(days >= 0)) {
    throw new HttpError(400, 'Choose a valid range of days.');
  }
  if (days > MAX_RANGE_DAYS) throw new HttpError(400, `Choose ${MAX_RANGE_DAYS} days or fewer.`);
  return { from, to };
};

// { lat, lng } rounded, or throws a 400
const coordinates = (query) => {
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpError(400, 'Please share a valid location.');
  }
  return { lat: round(lat), lng: round(lng) };
};

// ?lat&lng -> the place there; ?q=Atlanta or ?q=30301 -> that place
router.get('/place', async (req, res) => {
  if (typeof req.query.q === 'string') {
    const q = req.query.q.trim();
    if (q.length < 2 || q.length > 100) throw new HttpError(400, 'Enter a city or ZIP code.');
    const place = await places.search(q);
    if (!place) throw new HttpError(404, `Couldn't find "${q}". Try a city name or ZIP code.`);
    return res.json({ place });
  }

  const { lat, lng } = coordinates(req.query);
  res.json({ place: await places.reverse(lat, lng) });
});

router.get('/events', async (req, res) => {
  const { lat, lng } = coordinates(req.query);
  const radiusMiles = req.query.radius === undefined ? 25 : Number(req.query.radius);
  if (!RADII.includes(radiusMiles)) throw new HttpError(400, `Radius must be one of ${RADII.join(', ')} miles.`);
  const category = req.query.category || 'all';
  if (!CATEGORIES.includes(category)) throw new HttpError(400, 'Unknown category.');

  const events = await ticketmaster.searchNearby({ lat, lng, radiusMiles, category, ...dayRange(req.query) });
  // Ticketmaster's terms expect credit where their data is shown
  res.json({ events, attribution: 'Ticketmaster' });
});

module.exports = router;
