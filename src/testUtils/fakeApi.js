// An in-memory stand-in for the EventBuddy API, installed as global.fetch,
// so screen tests run without a server. Only covers what the screens call.
const TOKEN = 'fake-token';

const noHandles = { venmo: '', cashapp: '', paypal: '', zelle: '' };

export const demoUser = {
  _id: 'u1',
  name: 'John Doe',
  email: 'user@example.com',
  username: 'johndoe',
  paymentHandles: noHandles
};

// Payment handles by user id. John starts with none; Alex can be paid.
const demoHandles = () => ({
  u1: { ...noHandles },
  u2: { venmo: 'alex-smith', cashapp: '', paypal: 'alexs', zelle: 'alex@example.com' }
});

const me = { _id: 'm1', user: 'u1', name: 'John Doe', color: '#7c3aed' };
const alex = { _id: 'm2', user: 'u2', name: 'Alex', color: '#3b82f6' };

const taylor = { _id: 'm3', user: 'u3', name: 'Taylor', color: '#10b981' };

const demoEvents = () => [
  {
    _id: '1',
    inviteCode: 'festival-code',
    name: 'Summer Music Festival',
    startDate: '2027-04-15',
    endDate: '2027-04-18',
    location: 'Indio, CA',
    budgetCents: 50000,
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
        attendees: [{ user: 'u2', name: 'Alex' }]
      }
    ],
    createdBy: 'u1'
  },
  {
    _id: '2',
    inviteCode: 'hiking-code',
    name: 'Hiking Trip',
    startDate: '2026-11-13',
    endDate: '2026-11-15',
    location: 'Smoky Mountains',
    members: [me],
    schedule: [],
    createdBy: 'u1'
  },
  {
    // Someone else's event, which John can only join through its invite
    _id: '3',
    inviteCode: 'game-code',
    name: 'Game Night',
    startDate: '2026-12-04',
    endDate: '2026-12-04',
    location: "Taylor's place",
    members: [taylor],
    schedule: [],
    createdBy: 'u3'
  }
];

// Round-trip through JSON like a real response, so the app never holds the
// fake's own objects (which it changes in place)
const respond = (status, body) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(JSON.parse(JSON.stringify(body))) });

// Event 1's money: Alex paid a $300 Airbnb, split with John
const demoLedger = () => ({
  '1': {
    expenses: [
      {
        _id: 'x1',
        description: 'Airbnb',
        amountCents: 30000,
        date: '2027-03-01',
        paidBy: { user: 'u2', name: 'Alex' },
        splitType: 'equal',
        shares: [{ user: 'u1', name: 'John Doe', amountCents: 15000 }, { user: 'u2', name: 'Alex', amountCents: 15000 }],
        createdBy: 'u2'
      }
    ],
    payments: []
  }
});

let events = demoEvents();
let ledgers = demoLedger();
let handles = demoHandles();

const currentUser = () => ({ ...demoUser, paymentHandles: handles.u1 });
let nextItemId = 100;
let nextEventId = 100;

const ledgerFor = (eventId) => {
  ledgers[eventId] = ledgers[eventId] || { expenses: [], payments: [] };
  return ledgers[eventId];
};

// Fills in names like the real API does
const withName = (event, user) => ({ user, name: event.members.find((m) => m.user === user)?.name ?? '?' });

const moneyRoute = (event, method, kind, id, body) => {
  const ledger = ledgerFor(event._id);
  if (kind === 'expenses' && method === 'GET' && !id) return respond(200, ledger);

  if (kind === 'expenses') {
    const stored = body && {
      ...body,
      paidBy: withName(event, body.paidBy),
      shares: body.shares.map((s) => ({ ...withName(event, s.user), amountCents: s.amountCents }))
    };
    if (method === 'POST') {
      const expense = { ...stored, _id: `x${nextItemId++}`, createdBy: demoUser._id };
      ledger.expenses.unshift(expense);
      return respond(201, { expense });
    }
    const index = ledger.expenses.findIndex((e) => e._id === id);
    if (index === -1) return respond(404, { message: 'Expense not found.' });
    if (method === 'PATCH') {
      ledger.expenses[index] = { ...ledger.expenses[index], ...stored };
      return respond(200, { expense: ledger.expenses[index] });
    }
    ledger.expenses.splice(index, 1);
    return respond(204);
  }

  if (method === 'POST') {
    const payment = {
      ...body,
      _id: `p${nextItemId++}`,
      from: withName(event, body.from),
      to: withName(event, body.to),
      createdBy: demoUser._id
    };
    ledger.payments.unshift(payment);
    return respond(201, { payment });
  }
  ledger.payments = ledger.payments.filter((p) => p._id !== id);
  return respond(204);
};

const isMember = (event) => event.members.some((m) => m.user === demoUser._id);

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
  if (method === 'POST' && path === '/auth/register') {
    return respond(201, { token: TOKEN, user: currentUser() });
  }
  if (method === 'POST' && path === '/auth/login') {
    const { email, password } = body;
    return email === demoUser.email && password === 'password'
      ? respond(200, { token: TOKEN, user: currentUser() })
      : respond(401, { message: 'Invalid email or password' });
  }
  if (!authed) return respond(401, { message: 'Please log in.' });

  if (path === '/auth/me' && method === 'PATCH') {
    const next = { ...handles.u1, ...body.paymentHandles };
    // One server rule, enough to show its messages reach the form
    if (next.venmo && next.venmo.length < 5) {
      return respond(400, { message: 'Venmo usernames are 5-30 letters, numbers, dashes or underscores.' });
    }
    handles.u1 = next;
    return respond(200, { user: currentUser() });
  }
  if (path === '/auth/me') return respond(200, { user: currentUser() });
  if (path === '/events' && method === 'POST') {
    const event = {
      ...body,
      _id: `e${nextEventId}`,
      inviteCode: `code-${nextEventId++}`,
      members: [me],
      schedule: [],
      createdBy: demoUser._id
    };
    events.push(event);
    return respond(201, { event });
  }
  if (path === '/events') return respond(200, { events: events.filter(isMember) });

  const inviteMatch = path.match(/^\/invites\/([^/]+)(\/join)?$/);
  if (inviteMatch) {
    const event = events.find((e) => e.inviteCode === decodeURIComponent(inviteMatch[1]));
    if (!event) return respond(404, { message: "This invite link isn't valid anymore. Ask for a new one." });
    if (inviteMatch[2]) {
      if (!isMember(event)) event.members.push({ _id: 'm9', user: demoUser._id, name: demoUser.name, color: '#3b82f6' });
      return respond(200, { event });
    }
    const organizer = event.members.find((m) => m.user === event.createdBy);
    return respond(200, {
      invite: {
        eventId: event._id,
        name: event.name,
        startDate: event.startDate,
        endDate: event.endDate,
        location: event.location,
        organizerName: organizer?.name ?? '',
        memberCount: event.members.length,
        isMember: isMember(event)
      }
    });
  }

  // /events/:id/invite/reset
  const resetMatch = path.match(/^\/events\/([^/]+)\/invite\/reset$/);
  if (resetMatch && method === 'POST') {
    const event = events.find((e) => e._id === resetMatch[1] && isMember(e));
    if (!event) return respond(404, { message: 'Event not found.' });
    event.inviteCode = `reset-${nextEventId++}`;
    return respond(200, { event });
  }

  // /events/:id/payment-handles: members with at least one handle
  const handlesMatch = path.match(/^\/events\/([^/]+)\/payment-handles$/);
  if (handlesMatch) {
    const event = events.find((e) => e._id === handlesMatch[1] && isMember(e));
    if (!event) return respond(404, { message: 'Event not found.' });
    const list = event.members
      .map((m) => ({ user: m.user, name: m.name, ...(handles[m.user] || noHandles) }))
      .filter((h) => h.venmo || h.cashapp || h.paypal || h.zelle);
    return respond(200, { handles: list });
  }

  // /events/:id/expenses[/:expenseId], /events/:id/payments[/:paymentId]
  const moneyMatch = path.match(/^\/events\/([^/]+)\/(expenses|payments)(?:\/([^/]+))?$/);
  if (moneyMatch) {
    const event = events.find((e) => e._id === moneyMatch[1] && isMember(e));
    if (!event) return respond(404, { message: 'Event not found.' });
    return moneyRoute(event, method, moneyMatch[2], moneyMatch[3], body);
  }

  // /events/:id, /events/:id/schedule[/:itemId[/going]]
  const match = path.match(/^\/events\/([^/]+)(?:\/schedule(?:\/([^/]+)(?:\/(going))?)?)?$/);
  if (!match) return respond(404, { message: 'Not found.' });

  // Like the real API, events you're not a member of don't exist for you
  const event = events.find((e) => e._id === decodeURIComponent(match[1]) && isMember(e));
  if (!event) return respond(404, { message: 'Event not found.' });

  if (path.includes('/schedule')) {
    return scheduleRoute(event, method, match[2] && decodeURIComponent(match[2]), match[3], body);
  }
  if (method === 'PATCH') Object.assign(event, body);
  return respond(200, { event });
};

// Installs the fake with fresh data. Returns logIn(), which saves a session
// the way a past login would have, so the app opens already logged in.
// options.handles replaces the starting payment handles ({ userId: handles })
export const installFakeApi = (options = {}) => {
  events = demoEvents();
  ledgers = demoLedger();
  handles = { ...demoHandles(), ...options.handles };
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
      localStorage.setItem('eventbuddy_user', JSON.stringify(currentUser()));
    }
  };
};
