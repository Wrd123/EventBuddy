// Coordinates <-> "Atlanta, GA", using OpenStreetMap's Nominatim service.
// Its usage policy asks for an identifying User-Agent and at most one
// request per second, so lookups are cached for a day and queued.
const { HttpError } = require('../errors');
const { createCache } = require('./cache');
const { nominatimContact, nominatimIntervalMs } = require('../config');

const BASE_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = `EventBuddy/0.1 (${nominatimContact})`;
const MIN_INTERVAL_MS = nominatimIntervalMs;

const cache = createCache({ ttlMs: 24 * 60 * 60 * 1000, max: 2000 });

// One request at a time, at least MIN_INTERVAL_MS apart
let queue = Promise.resolve();
let lastRequestAt = 0;
const throttled = (task) => {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.catch(() => {});
  return run;
};

const getJson = (path) =>
  throttled(async () => {
    let response;
    try {
      response = await fetch(`${BASE_URL}${path}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    } catch {
      throw new HttpError(502, "Couldn't look up that location. Try again in a moment.");
    }
    if (!response.ok) throw new HttpError(502, "Couldn't look up that location. Try again in a moment.");
    return response.json();
  });

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

const reverse = async (lat, lng) => {
  const key = `rev:${lat},${lng}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const data = await getJson(`/reverse?format=jsonv2&addressdetails=1&zoom=10&lat=${lat}&lon=${lng}`);
  const place = { label: labelFor(data.address) || 'your area', lat, lng };
  cache.set(key, place);
  return place;
};

const searchOnce = async (extra) => {
  const params = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '1', countrycodes: 'us', ...extra });
  const [match] = await getJson(`/search?${params}`);
  return match;
};

// A city, "City, ST" or ZIP code -> place, or null if nothing matches.
// A plain search for "Decatur, GA" returns Decatur *County* (a different
// area entirely), so towns and cities are searched first, ZIP codes use the
// postal-code search, and anything else falls back to a general search.
const search = async (query) => {
  const key = `q:${query.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const match = /^\d{5}$/.test(query)
    ? await searchOnce({ postalcode: query })
    : (await searchOnce({ q: query, featureType: 'city' })) || (await searchOnce({ q: query }));
  const place = match
    ? { label: labelFor(match.address) || query, lat: round(Number(match.lat)), lng: round(Number(match.lon)) }
    : null;
  cache.set(key, place);
  return place;
};

module.exports = {
  reverse,
  search,
  labelFor,
  USER_AGENT,
  clearCache: () => {
    cache.clear();
    lastRequestAt = 0;
  }
};
