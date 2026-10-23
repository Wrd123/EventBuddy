// An in-memory stand-in for the EventBuddy API, installed as global.fetch,
// so screen tests run without a server. Only covers what the screens call.
const TOKEN = 'fake-token';

export const demoUser = { _id: 'u1', name: 'John Doe', email: 'user@example.com', username: 'johndoe' };

const me = { _id: 'm1', user: 'u1', name: 'John Doe', color: '#7c3aed' };
const alex = { _id: 'm2', user: null, name: 'Alex', color: '#3b82f6' };

const demoEvents = () => [
  {
    _id: '1',
    name: 'Summer Music Festival',
    startDate: '2027-04-15',
    endDate: '2027-04-18',
    location: 'Indio, CA',
    members: [me, alex],
    schedule: [
      {
        _id: 's2',
        date: '2027-04-15',
        startTime: '16:00',
        endTime: '17:00',
        activity: 'Tame Impala',
        location: 'Sunset Stage',
        attendees: []
      },
      {
        _id: 's1',
        date: '2027-04-15',
        startTime: '14:00',
        endTime: '15:30',
        activity: 'Arctic Monkeys',
        location: 'Main Stage',
        attendees: [{ user: null, name: 'Alex' }]
      }
    ],
    createdBy: 'u1'
  },
  {
    _id: '2',
    name: 'Hiking Trip',
    startDate: '2026-11-13',
    endDate: '2026-11-15',
    location: 'Smoky Mountains',
    members: [me],
    schedule: [],
    createdBy: 'u1'
  }
];

// Round-trip through JSON like a real response, so the app never holds the
// fake's own objects (which it changes in place)
const respond = (status, body) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(JSON.parse(JSON.stringify(body))) });

let events = demoEvents();
let nextItemId = 100;

// Applies a schedule change and returns { event } like the real API
const scheduleRoute = (event, method, itemId, action, body) => {
  const item = itemId && event.schedule.find((i) => i._id === itemId);
  if (itemId && !item) return respond(404, { message: 'Schedule item not found.' });

  if (!itemId && method === 'POST') {
    event.schedule.push({ ...body, _id: `s${nextItemId++}`, attendees: [] });
  } else if (action === 'going' && method === 'PUT') {
    if (!item.attendees.some((a) => a.user === demoUser._id)) {
      item.attendees.push({ user: demoUser._id, name: demoUser.name });
    }
  } else if (action === 'going' && method === 'DELETE') {
    item.attendees = item.attendees.filter((a) => a.user !== demoUser._id);
  } else if (method === 'PATCH') {
    Object.assign(item, body);
  } else if (method === 'DELETE') {
    event.schedule = event.schedule.filter((i) => i !== item);
  } else {
    return respond(404, { message: 'Not found.' });
  }
  return respond(method === 'POST' && !itemId ? 201 : 200, { event });
};

const route = (method, path, body, authed) => {
  if (method === 'POST' && path === '/auth/login') {
    const { email, password } = body;
    return email === demoUser.email && password === 'password'
      ? respond(200, { token: TOKEN, user: demoUser })
      : respond(401, { message: 'Invalid email or password' });
  }
  if (!authed) return respond(401, { message: 'Please log in.' });

  if (path === '/auth/me') return respond(200, { user: demoUser });
  if (path === '/events') return respond(200, { events });

  // /events/:id, /events/:id/schedule[/:itemId[/going]]
  const match = path.match(/^\/events\/([^/]+)(?:\/schedule(?:\/([^/]+)(?:\/(going))?)?)?$/);
  if (!match) return respond(404, { message: 'Not found.' });

  const event = events.find((e) => e._id === decodeURIComponent(match[1]));
  if (!event) return respond(404, { message: 'Event not found.' });

  if (path.includes('/schedule')) {
    return scheduleRoute(event, method, match[2] && decodeURIComponent(match[2]), match[3], body);
  }
  return respond(200, { event });
};

// Installs the fake with fresh data. Returns logIn(), which saves a session
// the way a past login would have, so the app opens already logged in.
export const installFakeApi = () => {
  events = demoEvents();
  global.fetch = jest.fn((url, { method = 'GET', headers = {}, body } = {}) =>
    route(
      method,
      url.replace(/^\/api/, ''),
      body ? JSON.parse(body) : undefined,
      headers.Authorization === `Bearer ${TOKEN}`
    )
  );

  return {
    logIn: () => {
      localStorage.setItem('eventbuddy_token', TOKEN);
      localStorage.setItem('eventbuddy_user', JSON.stringify(demoUser));
    }
  };
};
