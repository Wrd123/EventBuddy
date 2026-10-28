const { useTestDatabase, api, registerUser } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const config = require('../src/config');
const ticketmaster = require('../src/discover/ticketmaster');
const places = require('../src/discover/places');
const { encodeGeohash } = require('../src/discover/geohash');

useTestDatabase();

// Fake Ticketmaster and Nominatim. Every outgoing fetch is recorded, so tests
// can check what was asked and that caching avoids repeat calls.
const tmEvent = (overrides = {}) => ({
  id: 'abc123',
  name: 'Arctic Monkeys',
  url: 'https://www.ticketmaster.com/event/abc123',
  distance: 4.26,
  dates: { start: { localDate: '2099-11-20', localTime: '19:30:00' } },
  classifications: [{ segment: { name: 'Music' }, genre: { name: 'Rock' } }],
  _embedded: { venues: [{ name: 'State Farm Arena', city: { name: 'Atlanta' }, state: { stateCode: 'GA' } }] },
  ...overrides
});

let calls;
let ticketmasterReply;
let nominatimReply;

const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

beforeEach(() => {
  calls = [];
  ticketmasterReply = () => json(200, { _embedded: { events: [tmEvent()] } });
  nominatimReply = (url) =>
    url.pathname === '/reverse'
      ? json(200, { address: { city: 'Atlanta', country_code: 'us', 'ISO3166-2-lvl4': 'US-GA' } })
      : json(200, [{ lat: '33.7490', lon: '-84.3880', address: { city: 'Atlanta', country_code: 'us', 'ISO3166-2-lvl4': 'US-GA' } }]);
  ticketmaster.clearCache();
  places.clearCache();

  mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, headers: options.headers || {} });
    if (url.hostname === 'app.ticketmaster.com') return ticketmasterReply(url);
    if (url.hostname === 'nominatim.openstreetmap.org') return nominatimReply(url, options);
    throw new Error(`Unexpected fetch to ${url}`);
  });
});

const originalTiming = { interval: config.nominatimIntervalMs, deadline: config.lookupDeadlineMs };
afterEach(() => {
  mock.restoreAll();
  config.nominatimIntervalMs = originalTiming.interval;
  config.lookupDeadlineMs = originalTiming.deadline;
});

// A request that never answers, until it's given up on
const hang = (url, options) =>
  new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));

const tmCalls = () => calls.filter((c) => c.url.hostname === 'app.ticketmaster.com');

// Resolves to the response, after checking its status
const getEvents = async (query, auth, status = 200) => {
  const user = auth || (await registerUser()).auth;
  return api().get('/api/discover/events').query(query).set('Authorization', user).expect(status);
};

describe('GET /api/discover/events', () => {
  it('returns nearby events in EventBuddy shape', async () => {
    const res = await getEvents({ lat: 33.749, lng: -84.388 }, undefined, 200);

    assert.equal(res.body.attribution, 'Ticketmaster');
    assert.deepEqual(res.body.events, [{
      _id: 'tm_abc123',
      source: 'ticketmaster',
      name: 'Arctic Monkeys',
      type: 'concert',
      startDate: '2099-11-20',
      endDate: '2099-11-20',
      startTime: '19:30',
      venue: 'State Farm Arena',
      location: 'Atlanta, GA',
      distanceMiles: 4.3,
      ticketUrl: 'https://www.ticketmaster.com/event/abc123',
      imageUrl: '',
      lat: null,
      lng: null
    }]);
  });

  it("includes the venue's position for the map, when it's valid", async () => {
    const at = (location) => tmEvent({
      _embedded: { venues: [{ name: 'State Farm Arena', city: { name: 'Atlanta' }, location }] }
    });
    ticketmasterReply = () => json(200, {
      _embedded: {
        events: [
          at({ latitude: '33.7573', longitude: '-84.3963' }),
          at({ latitude: 'unknown', longitude: '-84.3963' }),
          at({ latitude: '133.7', longitude: '-84.3963' })
        ]
      }
    });

    const res = await getEvents({ lat: 33.749, lng: -84.388 });
    assert.deepEqual(res.body.events.map((e) => [e.lat, e.lng]), [[33.7573, -84.3963], [null, null], [null, null]]);
  });

  it('asks Ticketmaster for upcoming events around the point, soonest first', async () => {
    await getEvents({ lat: 33.749, lng: -84.388, radius: 50, category: 'sports' }, undefined, 200);

    const { searchParams } = tmCalls()[0].url;
    assert.equal(searchParams.get('apikey'), 'test-ticketmaster-key');
    assert.equal(searchParams.get('geoPoint'), encodeGeohash(33.75, -84.39));
    assert.equal(searchParams.get('radius'), '50');
    assert.equal(searchParams.get('unit'), 'miles');
    assert.equal(searchParams.get('sort'), 'date,asc');
    assert.equal(searchParams.get('segmentName'), 'Sports');
    assert.match(searchParams.get('startDateTime'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('can look only at events starting on certain days, like during a trip', async () => {
    await getEvents({ lat: 33.75, lng: -84.39, from: '2099-04-15', to: '2099-04-18' });
    const { searchParams } = tmCalls()[0].url;
    assert.equal(searchParams.get('localStartDateTime'), '2099-04-15T00:00:00,2099-04-18T23:59:59');
    assert.equal(searchParams.has('startDateTime'), false);

    // A different range is a different search, not a cached one
    await getEvents({ lat: 33.75, lng: -84.39, from: '2099-04-16', to: '2099-04-18' });
    assert.equal(tmCalls().length, 2);
  });

  it("doesn't filter by segment for all categories", async () => {
    await getEvents({ lat: 33.749, lng: -84.388 }, undefined, 200);
    assert.equal(tmCalls()[0].url.searchParams.has('segmentName'), false);
  });

  it('maps Ticketmaster categories to event types', async () => {
    ticketmasterReply = () => json(200, {
      _embedded: {
        events: [
          tmEvent({ id: '1', name: 'Shaky Knees Festival' }),
          tmEvent({ id: '2', classifications: [{ segment: { name: 'Sports' } }] }),
          tmEvent({ id: '3', classifications: [{ segment: { name: 'Arts & Theatre' } }] }),
          tmEvent({ id: '4', classifications: [{ segment: { name: 'Family' } }] })
        ]
      }
    });
    const res = await getEvents({ lat: 33.749, lng: -84.388 }, undefined, 200);

    assert.deepEqual(res.body.events.map((e) => e.type), ['music-festival', 'sports', 'arts', 'arts']);
  });

  it('handles missing optional details and skips undated listings', async () => {
    ticketmasterReply = () => json(200, {
      _embedded: {
        events: [
          tmEvent({ id: '1', distance: undefined, url: undefined, dates: { start: { localDate: '2099-01-01' } } }),
          tmEvent({ id: '2', dates: { start: { dateTBD: true } } })
        ]
      }
    });
    const res = await getEvents({ lat: 33.749, lng: -84.388 }, undefined, 200);

    assert.equal(res.body.events.length, 1);
    assert.equal(res.body.events[0].startTime, '');
    assert.equal(res.body.events[0].distanceMiles, null);
    assert.equal(res.body.events[0].ticketUrl, '');
  });

  it('returns an empty list when nothing is nearby', async () => {
    ticketmasterReply = () => json(200, { page: { totalElements: 0 } });
    const res = await getEvents({ lat: 33.749, lng: -84.388 }, undefined, 200);
    assert.deepEqual(res.body.events, []);
  });

  it('shares cached results between nearby searches', async () => {
    const { auth } = await registerUser();
    await getEvents({ lat: 33.749, lng: -84.388 }, auth, 200);
    // Within the same ~1 km rounding
    await getEvents({ lat: 33.7512, lng: -84.3851 }, auth, 200);

    assert.equal(tmCalls().length, 1);
  });

  it('never sends more than two decimal places of location', async () => {
    await getEvents({ lat: 33.748992, lng: -84.387985 }, undefined, 200);
    assert.equal(tmCalls()[0].url.searchParams.get('geoPoint'), encodeGeohash(33.75, -84.39));
  });

  const invalid = [
    ['a missing location', {}, 'Please share a valid location.'],
    ['an impossible latitude', { lat: 95, lng: 10 }, 'Please share a valid location.'],
    ['an unsupported radius', { lat: 33.7, lng: -84.4, radius: 7 }, 'Radius must be one of 10, 25, 50, 100 miles.'],
    ['an unknown category', { lat: 33.7, lng: -84.4, category: 'food' }, 'Unknown category.'],
    ['half a range of days', { lat: 33.7, lng: -84.4, from: '2099-04-15' }, 'Choose a valid range of days.'],
    ['a range that ends before it starts', { lat: 33.7, lng: -84.4, from: '2099-04-15', to: '2099-04-14' }, 'Choose a valid range of days.'],
    ['a range over a month', { lat: 33.7, lng: -84.4, from: '2099-04-01', to: '2099-05-15' }, 'Choose 31 days or fewer.']
  ];
  for (const [label, query, message] of invalid) {
    it(`rejects ${label}`, async () => {
      const res = await getEvents(query, undefined, 400);
      assert.equal(res.body.message, message);
      assert.equal(tmCalls().length, 0);
    });
  }

  it('requires login', async () => {
    await api().get('/api/discover/events').query({ lat: 33.7, lng: -84.4 }).expect(401);
  });

  it('says local events are unavailable, without setup instructions, when no Ticketmaster key is set', async () => {
    const original = config.ticketmasterApiKey;
    config.ticketmasterApiKey = '';
    try {
      const res = await getEvents({ lat: 33.749, lng: -84.388 }, undefined, 503);
      assert.equal(res.body.message, "Local events aren't available on this server. You can still plan your own.");
      assert.doesNotMatch(res.body.message, /API key/);
    } finally {
      config.ticketmasterApiKey = original;
    }
  });

  it('reports Ticketmaster rate limits as a temporary problem', async () => {
    ticketmasterReply = () => json(429, {});
    const res = await getEvents({ lat: 33.749, lng: -84.388 }, undefined, 503);
    assert.equal(res.body.message, 'Too many searches right now. Try again in a minute.');
  });

  it("hides Ticketmaster's error details", async () => {
    const quiet = mock.method(console, 'error', () => {});
    ticketmasterReply = () => json(401, { fault: { faultstring: 'Invalid ApiKey' } });
    const res = await getEvents({ lat: 33.749, lng: -84.388 }, undefined, 502);

    assert.equal(res.body.message, "Couldn't load local events right now.");
    assert.equal(quiet.mock.callCount(), 1);
  });

  it("doesn't cache failures", async () => {
    const { auth } = await registerUser();
    ticketmasterReply = () => json(429, {});
    await getEvents({ lat: 33.749, lng: -84.388 }, auth, 503);
    ticketmasterReply = () => json(200, { _embedded: { events: [tmEvent()] } });
    await getEvents({ lat: 33.749, lng: -84.388 }, auth, 200);

    assert.equal(tmCalls().length, 2);
  });
});

describe('GET /api/discover/place', () => {
  const getPlace = async (query, status = 200) => {
    const { auth } = await registerUser();
    return api().get('/api/discover/place').query(query).set('Authorization', auth).expect(status);
  };

  it('names the place at a location, like "Atlanta, GA"', async () => {
    const res = await getPlace({ lat: 33.749, lng: -84.388 }, 200);

    assert.deepEqual(res.body.place, { label: 'Atlanta, GA', lat: 33.75, lng: -84.39 });
  });

  it('identifies EventBuddy to OpenStreetMap, as its policy requires', async () => {
    await getPlace({ lat: 33.749, lng: -84.388 }, 200);
    assert.match(calls[0].headers['User-Agent'], /^EventBuddy\/\S+ \(.+\)$/);
  });

  it('finds a typed city, preferring towns and cities over counties', async () => {
    const res = await getPlace({ q: 'Atlanta, GA' });

    assert.deepEqual(res.body.place, { label: 'Atlanta, GA', lat: 33.75, lng: -84.39 });
    assert.equal(calls[0].url.searchParams.get('q'), 'Atlanta, GA');
    assert.equal(calls[0].url.searchParams.get('featureType'), 'city');
    assert.equal(calls[0].url.searchParams.get('countrycodes'), 'us');
  });

  it('looks up ZIP codes as postal codes', async () => {
    await getPlace({ q: '30303' });

    assert.equal(calls[0].url.searchParams.get('postalcode'), '30303');
    assert.equal(calls[0].url.searchParams.has('q'), false);
  });

  it('falls back to a general search when no city matches', async () => {
    nominatimReply = (url) => (url.searchParams.get('featureType') === 'city'
      ? json(200, [])
      : json(200, [{ lat: '33.78', lon: '-84.38', address: { suburb: 'Midtown', city: 'Atlanta', country_code: 'us', 'ISO3166-2-lvl4': 'US-GA' } }]));
    const res = await getPlace({ q: 'Midtown Atlanta' });

    assert.equal(res.body.place.label, 'Atlanta, GA');
    assert.equal(calls.length, 2);
  });

  it('says when a typed place is not found', async () => {
    nominatimReply = () => json(200, []);
    const res = await getPlace({ q: 'Nowheresville' }, 404);
    assert.equal(res.body.message, 'Couldn\'t find "Nowheresville". Try a city name or ZIP code.');
  });

  it('rejects a one-letter search', async () => {
    await getPlace({ q: 'a' }, 400);
  });

  it('caches lookups', async () => {
    const { auth } = await registerUser();
    for (let i = 0; i < 3; i += 1) {
      await api().get('/api/discover/place').query({ lat: 33.749, lng: -84.388 }).set('Authorization', auth).expect(200);
    }
    assert.equal(calls.length, 1);
  });
});

describe('place lookups under load', () => {
  const nominatimCalls = () => calls.filter((c) => c.url.hostname === 'nominatim.openstreetmap.org');
  const outcome = (promise) => promise.then(() => 'ok', (err) => err.status);

  it('gives up on a hung request in time, and the next lookup still runs', async () => {
    config.lookupDeadlineMs = 200;
    nominatimReply = hang;
    const started = Date.now();
    await assert.rejects(places.search('Atlanta, GA'), { status: 502 });
    assert.ok(Date.now() - started < 1000);

    nominatimReply = () => json(200, [{ lat: '36.16', lon: '-86.78', address: { city: 'Nashville', country_code: 'us' } }]);
    assert.equal((await places.search('Nashville, TN')).label, 'Nashville');
  });

  it('sends the same lookup once when it is asked for twice at once', async () => {
    const [a, b] = await Promise.all([places.search('Atlanta, GA'), places.search('atlanta, ga')]);
    assert.deepEqual(a, b);
    assert.equal(nominatimCalls().length, 1);
  });

  it("doesn't keep sharing a lookup that failed", async () => {
    nominatimReply = () => json(503, {});
    await Promise.all([outcome(places.search('Atlanta, GA')), outcome(places.search('Atlanta, GA'))]);
    assert.equal(nominatimCalls().length, 1);

    nominatimReply = () => json(200, [{ lat: '33.749', lon: '-84.388', address: { city: 'Atlanta', country_code: 'us' } }]);
    assert.equal((await places.search('Atlanta, GA')).label, 'Atlanta');
  });

  it('turns lookups away quickly when the line is too long to answer in time', async () => {
    config.nominatimIntervalMs = 150;
    config.lookupDeadlineMs = 400;
    const started = Date.now();
    const results = await Promise.all(
      ['Austin, TX', 'Boston, MA', 'Denver, CO', 'Miami, FL', 'Reno, NV', 'Tulsa, OK'].map((q) => outcome(places.search(q)))
    );

    assert.ok(results.includes('ok'));
    assert.ok(results.includes(503));
    // Nobody waited much past the deadline for an answer
    assert.ok(Date.now() - started < 800);
  });
});

describe('places.labelFor', () => {
  it('uses a town when there is no city, and the country outside the US', () => {
    assert.equal(places.labelFor({ town: 'Decatur', country_code: 'us', 'ISO3166-2-lvl4': 'US-GA' }), 'Decatur, GA');
    assert.equal(places.labelFor({ city: 'Toronto', country_code: 'ca', state: 'Ontario' }), 'Toronto, Ontario');
  });
});

describe('event artwork', () => {
  const image = (overrides = {}) => ({
    ratio: '16_9', url: 'https://s1.ticketm.net/dam/a/1/art_16_9_1024.jpg', width: 1024, height: 576, fallback: false, ...overrides
  });
  const stock = image({ url: 'https://s1.ticketm.net/dam/c/stock_crowd_16_9.jpg', fallback: true });
  const sizes = [
    image({ ratio: '3_2', url: 'https://s1.ticketm.net/dam/a/1/art_3_2_305.jpg', width: 305, height: 203 }),
    image({ ratio: '16_9', url: 'https://s1.ticketm.net/dam/a/1/art_16_9_640.jpg', width: 640, height: 360 }),
    image(),
    image({ ratio: '4_3', url: 'https://s1.ticketm.net/dam/a/1/art_4_3_305.jpg', width: 305, height: 225 })
  ];

  it('uses the illustrated cover when there are no images', () => {
    assert.equal(ticketmaster.pickImage([]), '');
    assert.equal(ticketmaster.pickImage(), '');
  });

  it("prefers the event's own artwork to Ticketmaster's generic artwork", () => {
    assert.equal(ticketmaster.pickImage([stock, ...sizes]), image().url);
  });

  it("uses Ticketmaster's generic artwork when the event has none of its own", () => {
    assert.equal(ticketmaster.pickImage([stock]), stock.url);
  });

  it('picks the smallest wide image that is sharp on a phone', () => {
    const large = image({ url: 'https://s1.ticketm.net/dam/a/1/art_16_9_2048.jpg', width: 2048, height: 1152 });
    const sharp3by2 = image({ ratio: '3_2', url: 'https://s1.ticketm.net/dam/a/1/art_3_2_1024.jpg', width: 1024, height: 683 });
    assert.equal(ticketmaster.pickImage([large, sharp3by2, ...sizes]), image().url);
    // Sharpness beats shape: a sharp 3:2 over a blurry 16:9
    assert.equal(ticketmaster.pickImage([sizes[1], sharp3by2]), sharp3by2.url);
  });

  it('takes the largest image when none are sharp enough', () => {
    assert.equal(ticketmaster.pickImage([sizes[0], sizes[3], sizes[1]]), sizes[1].url);
  });

  it('skips http images when an https one exists', () => {
    const insecure = image({ url: 'http://s1.ticketm.net/dam/a/1/art_16_9_1024.jpg' });
    assert.equal(ticketmaster.pickImage([insecure, sizes[0]]), sizes[0].url);
  });

  it('sends the chosen artwork with each event', async () => {
    ticketmasterReply = () => json(200, { _embedded: { events: [tmEvent({ images: [image()] })] } });
    const res = await getEvents({ lat: 33.749, lng: -84.388 });
    assert.equal(res.body.events[0].imageUrl, image().url);
  });

  it('never sends an image that would load over plain http', async () => {
    const insecure = image({ url: 'http://s1.ticketm.net/dam/a/1/art_16_9_1024.jpg' });
    ticketmasterReply = () => json(200, { _embedded: { events: [tmEvent({ images: [insecure] })] } });
    const res = await getEvents({ lat: 33.749, lng: -84.388 });
    assert.equal(res.body.events[0].imageUrl, '');
  });
});

describe('geohash', () => {
  it('matches known values', () => {
    // Published reference values for the geohash algorithm
    assert.equal(encodeGeohash(57.64911, 10.40744, 11), 'u4pruydqqvj');
    assert.equal(encodeGeohash(42.6, -5.6, 5), 'ezs42');
  });
});

describe('events planned from Discover', () => {
  const create = async (overrides, status = 201) => {
    const { auth } = await registerUser();
    return api()
      .post('/api/events')
      .set('Authorization', auth)
      .send({ name: 'Arctic Monkeys', type: 'concert', startDate: '2099-11-20', endDate: '2099-11-20', ...overrides })
      .expect(status);
  };

  it('keep their ticket link', async () => {
    const res = await create({ ticketUrl: 'https://www.ticketmaster.com/event/abc123' });
    assert.equal(res.body.event.ticketUrl, 'https://www.ticketmaster.com/event/abc123');
  });

  it('reject ticket links that are not https', async () => {
    const res = await create({ ticketUrl: 'javascript:alert(1)' }, 400);
    assert.equal(res.body.message, 'The ticket link must be an https:// address.');
  });

  it('accept the new sports and arts types', async () => {
    await create({ type: 'sports' });
    await create({ type: 'arts' });
  });
});
