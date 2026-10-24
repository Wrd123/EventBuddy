const { useTestDatabase, api, registerUser } = require('./helpers');
const assert = require('node:assert/strict');
const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const Event = require('../src/models/Event');
const places = require('../src/discover/places');
const { seedDemoData } = require('../src/seed/demoData');

useTestDatabase();

// A fake OpenStreetMap search: places by query text. Every lookup is recorded.
let lookups;
let knownPlaces;
let lookupFails;

beforeEach(() => {
  lookups = [];
  lookupFails = false;
  knownPlaces = {
    'indio, ca': { lat: '33.72061', lon: '-116.21561' },
    'atlanta, ga': { lat: '33.749', lon: '-84.388' },
    'nashville, tn': { lat: '36.1627', lon: '-86.7816' }
  };
  places.clearCache();
  mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    const q = url.searchParams.get('q');
    lookups.push(q);
    if (lookupFails) return { ok: false, status: 503, json: async () => ({}) };
    const match = knownPlaces[q.toLowerCase()];
    return { ok: true, status: 200, json: async () => (match ? [match] : []) };
  });
});

afterEach(() => mock.restoreAll());

const createEvent = async (auth, fields) =>
  (await api()
    .post('/api/events')
    .set('Authorization', auth)
    .send({ name: 'Trip', startDate: '2099-11-25', endDate: '2099-11-27', ...fields })
    .expect(201)).body.event;

const mapEvents = async (auth) => (await api().get('/api/map/events').set('Authorization', auth).expect(200)).body.events;

describe('GET /api/map/events', () => {
  it('places events at their location, looking each one up only once', async () => {
    const { auth } = await registerUser();
    const event = await createEvent(auth, { name: 'Coachella', location: 'Indio, CA' });

    const [pin] = await mapEvents(auth);
    assert.deepEqual(pin, {
      _id: event._id,
      name: 'Coachella',
      type: 'music-festival',
      startDate: '2099-11-25',
      endDate: '2099-11-27',
      location: 'Indio, CA',
      lat: 33.7206,
      lng: -116.2156
    });

    places.clearCache();
    await mapEvents(auth);
    assert.deepEqual(lookups, ['Indio, CA']);
  });

  it('falls back to the city when a venue address is not found', async () => {
    const { auth } = await registerUser();
    await createEvent(auth, { location: 'Tiny Bar, Atlanta, GA' });

    const [pin] = await mapEvents(auth);
    assert.deepEqual([pin.lat, pin.lng], [33.749, -84.388]);
    assert.deepEqual(lookups, ['Tiny Bar, Atlanta, GA', 'Atlanta, GA']);
  });

  it("leaves events with no location, or one that can't be found, off the map", async () => {
    const { auth } = await registerUser();
    await createEvent(auth, { name: 'Somewhere', location: 'Narnia' });
    await createEvent(auth, { name: 'Nowhere', location: '' });

    const pins = await mapEvents(auth);
    assert.deepEqual(pins.map((p) => [p.name, p.lat, p.lng]).sort(), [['Nowhere', null, null], ['Somewhere', null, null]]);

    // Not found is remembered too, so it isn't looked up on every visit
    places.clearCache();
    await mapEvents(auth);
    assert.deepEqual(lookups, ['Narnia']);
  });

  it('looks the location up again after it changes', async () => {
    const { auth } = await registerUser();
    const event = await createEvent(auth, { location: 'Indio, CA' });
    await mapEvents(auth);

    await api().patch(`/api/events/${event._id}`).set('Authorization', auth).send({ location: 'Nashville, TN' }).expect(200);

    const [pin] = await mapEvents(auth);
    assert.deepEqual([pin.location, pin.lat, pin.lng], ['Nashville, TN', 36.1627, -86.7816]);
  });

  it('tries again next time when the lookup service is down', async () => {
    const { auth } = await registerUser();
    await createEvent(auth, { location: 'Indio, CA' });

    lookupFails = true;
    assert.equal((await mapEvents(auth))[0].lat, null);

    lookupFails = false;
    assert.equal((await mapEvents(auth))[0].lat, 33.7206);
  });

  it('looks up at most five events per visit', async () => {
    const { auth } = await registerUser();
    for (let i = 0; i < 7; i++) await createEvent(auth, { name: `Trip ${i}`, location: 'Indio, CA' });

    const first = await mapEvents(auth);
    assert.equal(first.filter((p) => p.lat !== null).length, 5);
    const second = await mapEvents(auth);
    assert.equal(second.filter((p) => p.lat !== null).length, 7);
  });

  it("only shows events you're in, and needs a login", async () => {
    const owner = await registerUser();
    await createEvent(owner.auth, { location: 'Indio, CA' });
    const stranger = await registerUser();

    assert.deepEqual(await mapEvents(stranger.auth), []);
    await api().get('/api/map/events').expect(401);
  });

  it('keeps map positions out of ordinary event responses', async () => {
    const { auth } = await registerUser();
    const event = await createEvent(auth, { location: 'Indio, CA' });
    await mapEvents(auth);

    const res = await api().get(`/api/events/${event._id}`).set('Authorization', auth).expect(200);
    assert.equal(res.body.event.geo, undefined);
    assert.ok(await Event.findOne({ 'geo.for': 'Indio, CA' }));
  });

  it('has demo events placed without any lookups', async () => {
    await seedDemoData();
    const login = await api().post('/api/auth/login').send({ email: 'user@example.com', password: 'password' }).expect(200);

    const pins = await mapEvents(`Bearer ${login.body.token}`);
    assert.ok(pins.length >= 3);
    assert.ok(pins.every((p) => p.lat !== null));
    assert.deepEqual(lookups, []);
  });
});
