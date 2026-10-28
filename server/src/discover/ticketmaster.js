// Upcoming events near a point, from Ticketmaster's Discovery API, turned
// into EventBuddy's event shape. The API key stays on the server; the app
// only ever talks to /api/discover.
const { HttpError } = require('../errors');
const { encodeGeohash } = require('./geohash');
const { createCache } = require('./cache');
// Read at call time (not destructured) so the key can be set after startup
const config = require('../config');

const EVENTS_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

// Our categories -> Ticketmaster segments
const SEGMENTS = { music: 'Music', sports: 'Sports', arts: 'Arts & Theatre', family: 'Family' };

// Everyone searching the same rounded spot shares results for 30 minutes,
// which keeps us far inside Ticketmaster's free-tier limits
const cache = createCache({ ttlMs: 30 * 60 * 1000 });

// Ticketmaster segment/genre -> EventBuddy event type (picks the cover art
// and what "Plan with friends" creates)
const eventType = (event) => {
  const segment = event.classifications?.[0]?.segment?.name;
  if (segment === 'Music') return /fest/i.test(event.name) ? 'music-festival' : 'concert';
  if (segment === 'Sports') return 'sports';
  return 'arts';
};

// Ticketmaster's artwork for an event -> the one URL to use as its cover, or
// '' to show one of EventBuddy's stock photos for its type instead.
//
// images: about ten sizes of the same picture, e.g.
//   { ratio: '16_9', url: 'https://s1.ticketm.net/...jpg', width: 1024, height: 576, fallback: false }
// ratio is '16_9', '3_2' or '4_3'. fallback: true marks Ticketmaster's generic
// photo for the category (a crowd, a stadium), not this event's own artwork.
//
// The same URL fills every cover: the event sheet (full phone width, about
// 390 x 144 points), Home's suggestion cards (160 x 128) and Discover's list
// thumbnails (80 x 80). Phones draw 2-3 pixels per point, and each cover crops
// the picture to fill its box.
//
// Order of choice: the event's own artwork, then Ticketmaster's generic
// artwork, then (by returning '') a stock photo. Within that, a
// picture sharp enough for the event sheet, the widest shape, then the
// smallest file that's still sharp (or the largest, if none are).
const COVER_WIDTH = 1024; // about 390 points x 2.6 pixels per point
const RATIOS = ['16_9', '3_2', '4_3']; // widest first, for the sheet's banner

const pickImage = (images = []) => {
  const usable = images.filter((i) => /^https:\/\//.test(i.url || ''));
  const own = usable.filter((i) => !i.fallback);
  const pool = own.length ? own : usable;

  const sharp = (i) => (i.width || 0) >= COVER_WIDTH;
  const shape = (i) => (RATIOS.includes(i.ratio) ? RATIOS.indexOf(i.ratio) : RATIOS.length);
  const [best] = [...pool].sort((a, b) =>
    sharp(b) - sharp(a) ||
    shape(a) - shape(b) ||
    (sharp(a) ? a.width - b.width : (b.width || 0) - (a.width || 0))
  );
  return best?.url || '';
};

const normalize = (event) => {
  const venue = event._embedded?.venues?.[0];
  const city = venue?.city?.name;
  const region = venue?.state?.stateCode || venue?.country?.countryCode;
  const startDate = event.dates?.start?.localDate;
  const imageUrl = pickImage(event.images || []);
  const lat = Number(venue?.location?.latitude);
  const lng = Number(venue?.location?.longitude);
  // The venue's position, for the map; null when Ticketmaster doesn't have it
  const located = venue?.location && Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  return {
    _id: `tm_${event.id}`,
    source: 'ticketmaster',
    name: event.name,
    type: eventType(event),
    startDate,
    endDate: event.dates?.end?.localDate || startDate,
    // "19:30:00" -> "19:30"; absent when the time isn't announced yet
    startTime: event.dates?.start?.localTime?.slice(0, 5) || '',
    venue: venue?.name || '',
    location: [city, region].filter(Boolean).join(', '),
    distanceMiles: typeof event.distance === 'number' ? Math.round(event.distance * 10) / 10 : null,
    ticketUrl: event.url || '',
    // https only, so the app never loads insecure content
    imageUrl: /^https:\/\//.test(imageUrl || '') ? imageUrl : '',
    lat: located ? lat : null,
    lng: located ? lng : null
  };
};

// "2026-10-23T18:04:00Z": Ticketmaster rejects milliseconds
const nowForApi = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

// from/to (optional, "YYYY-MM-DD"): only events starting on those days, in
// the venue's own time zone. Otherwise everything from now on.
const searchNearby = async ({ lat, lng, radiusMiles, category, from, to }) => {
  // Visitors see this, so it says what they can do rather than how to
  // configure the server (the README covers TICKETMASTER_API_KEY)
  if (!config.ticketmasterApiKey) {
    throw new HttpError(503, "Local events aren't available on this server. You can still plan your own.");
  }

  const key = `${lat},${lng},${radiusMiles},${category},${from || ''},${to || ''}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const params = new URLSearchParams({
    apikey: config.ticketmasterApiKey,
    geoPoint: encodeGeohash(lat, lng),
    radius: String(radiusMiles),
    unit: 'miles',
    sort: 'date,asc',
    size: '40'
  });
  if (from) params.set('localStartDateTime', `${from}T00:00:00,${to}T23:59:59`);
  else params.set('startDateTime', nowForApi());
  if (SEGMENTS[category]) params.set('segmentName', SEGMENTS[category]);

  let response;
  try {
    // A hung request gives up well inside the app's own 15 second timeout
    response = await fetch(`${EVENTS_URL}?${params}`, { signal: AbortSignal.timeout(config.lookupDeadlineMs) });
  } catch {
    throw new HttpError(502, "Couldn't reach Ticketmaster. Try again in a moment.");
  }
  if (response.status === 429) {
    throw new HttpError(503, 'Too many searches right now. Try again in a minute.');
  }
  if (!response.ok) {
    // e.g. 401 for a wrong key; the details are logged, not shown
    console.error('Ticketmaster error', response.status, await response.text().catch(() => ''));
    throw new HttpError(502, "Couldn't load local events right now.");
  }

  // The time limit covers reading the answer too
  let data;
  try {
    data = await response.json();
  } catch {
    throw new HttpError(502, "Couldn't reach Ticketmaster. Try again in a moment.");
  }
  const events = (data._embedded?.events || [])
    .map(normalize)
    // Skip entries without a usable date (rare placeholder listings)
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.startDate || ''));

  cache.set(key, events);
  return events;
};

module.exports = { searchNearby, normalize, pickImage, SEGMENTS, clearCache: () => cache.clear() };
