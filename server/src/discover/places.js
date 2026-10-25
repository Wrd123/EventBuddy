// Coordinates <-> "Atlanta, GA", using OpenStreetMap's Nominatim service.
// Its usage policy asks for an identifying User-Agent and at most one
// request per second, so lookups are cached for a day and queued.
const { HttpError } = require('../errors');
const { createCache } = require('./cache');
const config = require('../config');

const BASE_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = `EventBuddy/0.1 (${config.nominatimContact})`;

const cache = createCache({ ttlMs: 24 * 60 * 60 * 1000, max: 2000 });

const unreachable = () => new HttpError(502, "Couldn't look up that location. Try again in a moment.");
const busy = () => new HttpError(503, 'Location lookups are busy. Try again in a moment.');

// One request at a time, at least nominatimIntervalMs apart. Every lookup
// has a deadline that covers waiting in line as well as the request itself,
// so a slow or hung lookup can't hold everyone behind it, and the line can't
// grow past what could be answered in time: a lookup that couldn't start
// before its deadline is turned away at once.
let queue = Promise.resolve();
let lastRequestAt = 0;
let waiting = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const throttled = (task, deadline) => {
  const interval = config.nominatimIntervalMs;
  const earliestStart = Math.max(Date.now(), lastRequestAt + interval) + waiting * interval;
  if (earliestStart >= deadline) return Promise.reject(busy());

  waiting += 1;
  let state = 'waiting'; // then 'running', or 'gave-up' at the deadline
  const leaveLine = () => {
    if (state === 'waiting') waiting -= 1;
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (state !== 'waiting') return;
      leaveLine();
      state = 'gave-up';
      reject(busy());
    }, deadline - Date.now());

    const run = queue.then(async () => {
      if (state === 'gave-up') return; // its turn came too late: skip it
      const wait = lastRequestAt + interval - Date.now();
      if (wait > 0) await sleep(wait);
      if (state === 'gave-up') return;
      leaveLine();
      state = 'running';
      clearTimeout(timer);
      lastRequestAt = Date.now();
      return task(deadline - Date.now());
    });
    queue = run.catch(() => {});
    run.then(
      (value) => state === 'running' && resolve(value),
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
};

const getJson = (path, deadline) =>
  throttled(async (msLeft) => {
    let response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        // A hung request gives up in time and lets the next one go
        signal: AbortSignal.timeout(Math.max(msLeft, 1))
      });
    } catch {
      throw unreachable();
    }
    if (!response.ok) throw unreachable();
    // The time limit covers reading the answer too
    try {
      return await response.json();
    } catch {
      throw unreachable();
    }
  }, deadline);

// The same lookup asked for twice at once (two people opening the map) is
// only sent once, and both get its answer. The answer comes by the first
// asker's deadline, so a later asker can get "busy" a little early; that
// costs at most a pin shown on the next visit, and keeps Nominatim from
// being asked the same thing twice.
const inFlight = new Map();
const once = (key, work) => {
  if (inFlight.has(key)) return inFlight.get(key);
  const pending = work().finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
};

const defaultDeadline = () => Date.now() + config.lookupDeadlineMs;

// Nominatim address -> "Atlanta, GA" (US) or "Toronto, Canada"
const labelFor = (address = {}) => {
  const city = address.city || address.town || address.village || address.hamlet || address.county || '';
  const isoRegion = address['ISO3166-2-lvl4'] || '';
  const region = address.country_code === 'us' && isoRegion.startsWith('US-')
    ? isoRegion.slice(3)
    : address.state || address.country || '';
  return [city, region].filter(Boolean).join(', ');
};

const round = (n) => Math.round(n * 100) / 100;

const reverse = async (lat, lng, { deadline = defaultDeadline() } = {}) => {
  const key = `rev:${lat},${lng}`;
  const cached = cache.get(key);
  if (cached) return cached;

  return once(key, async () => {
    const data = await getJson(`/reverse?format=jsonv2&addressdetails=1&zoom=10&lat=${lat}&lon=${lng}`, deadline);
    const place = { label: labelFor(data.address) || 'your area', lat, lng };
    cache.set(key, place);
    return place;
  });
};

const searchOnce = async (extra, deadline) => {
  const params = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '1', countrycodes: 'us', ...extra });
  const [match] = await getJson(`/search?${params}`, deadline);
  return match;
};

// A city, "City, ST" or ZIP code -> place, or null if nothing matches.
// A plain search for "Decatur, GA" returns Decatur *County* (a different
// area entirely), so towns and cities are searched first, ZIP codes use the
// postal-code search, and anything else falls back to a general search.
const search = async (query, { deadline = defaultDeadline() } = {}) => {
  const key = `q:${query.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  return once(key, async () => {
    const match = /^\d{5}$/.test(query)
      ? await searchOnce({ postalcode: query }, deadline)
      : (await searchOnce({ q: query, featureType: 'city' }, deadline)) || (await searchOnce({ q: query }, deadline));
    const place = match
      ? { label: labelFor(match.address) || query, lat: round(Number(match.lat)), lng: round(Number(match.lon)) }
      : null;
    cache.set(key, place);
    return place;
  });
};

const fine = (n) => Math.round(n * 10000) / 10000; // about 10 m

const searchAnywhere = async (q, deadline) => {
  const params = new URLSearchParams({ format: 'jsonv2', limit: '1', q });
  const [match] = await getJson(`/search?${params}`, deadline);
  return match;
};

// An event's location as typed ("Indio, CA", "State Farm Arena, Atlanta, GA")
// -> { lat, lng }, or null if nothing matches. Anywhere in the world, unlike
// search(). When the whole text doesn't match, its last two parts usually
// name the city, which still puts the pin in the right place.
const geocode = async (text, { deadline = defaultDeadline() } = {}) => {
  const key = `geo:${text.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  return once(key, async () => {
    const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
    const match = (await searchAnywhere(text, deadline)) ||
      (parts.length > 2 ? await searchAnywhere(parts.slice(-2).join(', '), deadline) : undefined);
    const point = match ? { lat: fine(Number(match.lat)), lng: fine(Number(match.lon)) } : null;
    cache.set(key, point);
    return point;
  });
};

module.exports = {
  reverse,
  search,
  geocode,
  labelFor,
  USER_AGENT,
  clearCache: () => {
    cache.clear();
    inFlight.clear();
    queue = Promise.resolve();
    lastRequestAt = 0;
    waiting = 0;
  }
};
