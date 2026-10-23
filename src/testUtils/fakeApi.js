// An in-memory stand-in for the EventBuddy API, installed as global.fetch,
// so screen tests run without a server. Only covers what the screens call.
const TOKEN = 'fake-token';

export const demoUser = { _id: 'u1', name: 'John Doe', email: 'user@example.com', username: 'johndoe' };

const me = { _id: 'm1', user: 'u1', name: 'John Doe', color: '#7c3aed' };

export const demoEvents = [
  {
    _id: '1',
    name: 'Summer Music Festival',
    startDate: '2027-04-15',
    endDate: '2027-04-18',
    location: 'Indio, CA',
    members: [me],
    schedule: [
      { _id: 's1', date: '2027-04-15', time: '2:00 PM - 3:30 PM', activity: 'Arctic Monkeys', location: 'Main Stage', attending: 4 }
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

const respond = (status, body) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const route = (method, path, body, authed) => {
  if (method === 'POST' && path === '/auth/login') {
    const { email, password } = JSON.parse(body);
    return email === demoUser.email && password === 'password'
      ? respond(200, { token: TOKEN, user: demoUser })
      : respond(401, { message: 'Invalid email or password' });
  }
  if (!authed) return respond(401, { message: 'Please log in.' });

  if (path === '/auth/me') return respond(200, { user: demoUser });
  if (path === '/events') return respond(200, { events: demoEvents });

  const eventMatch = path.match(/^\/events\/([^/]+)$/);
  if (eventMatch) {
    const event = demoEvents.find((e) => e._id === decodeURIComponent(eventMatch[1]));
    return event ? respond(200, { event }) : respond(404, { message: 'Event not found.' });
  }
  return respond(404, { message: 'Not found.' });
};

// Installs the fake. Returns logIn(), which saves a session the way a past
// login would have, so the app opens already logged in.
export const installFakeApi = () => {
  global.fetch = jest.fn((url, { method = 'GET', headers = {}, body } = {}) =>
    route(method, url.replace(/^\/api/, ''), body, headers.Authorization === `Bearer ${TOKEN}`)
  );

  return {
    logIn: () => {
      localStorage.setItem('eventbuddy_token', TOKEN);
      localStorage.setItem('eventbuddy_user', JSON.stringify(demoUser));
    }
  };
};
