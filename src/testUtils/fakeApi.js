import { act } from 'react';

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

// Discover's local (Ticketmaster) events, as the API returns them. Only the
// first has artwork; the others show illustrated covers.
export const localEvents = [
  {
    _id: 'tm_1', source: 'ticketmaster', name: 'Arctic Monkeys', type: 'concert',
    startDate: '2099-11-20', endDate: '2099-11-20', startTime: '19:30',
    venue: 'State Farm Arena', location: 'Atlanta, GA', distanceMiles: 4.3,
    ticketUrl: 'https://www.ticketmaster.com/event/1',
    imageUrl: 'https://s1.ticketm.net/dam/a/123/arctic-monkeys_16_9.jpg',
    lat: 33.7573, lng: -84.3963
  },
  {
    _id: 'tm_2', source: 'ticketmaster', name: 'Atlanta Hawks vs. Boston Celtics', type: 'sports',
    startDate: '2099-11-22', endDate: '2099-11-22', startTime: '19:00',
    venue: 'State Farm Arena', location: 'Atlanta, GA', distanceMiles: 4.3,
    ticketUrl: 'https://www.ticketmaster.com/event/2', imageUrl: '',
    lat: 33.7573, lng: -84.3963
  },
  {
    _id: 'tm_3', source: 'ticketmaster', name: 'Hamilton', type: 'arts',
    startDate: '2099-12-01', endDate: '2099-12-01', startTime: '',
    venue: 'Fox Theatre', location: 'Atlanta, GA', distanceMiles: 1.2,
    ticketUrl: '', imageUrl: '',
    lat: 33.7725, lng: -84.3857
  }
];

// Map positions of the demo events. The hiking trip's "Smoky Mountains"
// couldn't be found, so it has none.
const EVENT_POSITIONS = { '1': [33.7206, -116.2156], '5': [33.7851, -84.3738] };

const CATEGORY_TYPES = { music: ['concert', 'music-festival'], sports: ['sports'], arts: ['arts'], family: [] };

// Round-trip through JSON like a real response, so the app never holds the
// fake's own objects (which it changes in place)
// The body is copied now, as the server would send it, so a response held
// back (holdNext) still has the data from when it was asked for
const respond = (status, body) => {
  const sent = JSON.stringify(body);
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(sent === undefined ? undefined : JSON.parse(sent)) });
};

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
    // A retry with the same clientId gets the saved payment, like the real API
    const saved = body.clientId && ledger.payments.find((p) => p.clientId === body.clientId);
    if (saved) return respond(200, { payment: saved });
    // options.paymentOutcomes: what each "Mark paid" meets, in order.
    // 'lost' saves it but the response never arrives; a status fails it.
    const outcome = fakeOptions.paymentOutcomes?.shift();
    if (outcome === 409) return respond(409, { message: "That's already settled. Balances have been updated." });
    if (typeof outcome === 'number') return respond(outcome, { message: 'Something went wrong. Please try again.' });
    const payment = {
      ...body,
      _id: `p${nextItemId++}`,
      from: withName(event, body.from),
      to: withName(event, body.to),
      createdBy: demoUser._id
    };
    ledger.payments.unshift(payment);
    if (outcome === 'lost') return Promise.reject(new TypeError('Network request failed'));
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
  } else if (action === 'going' && fakeOptions.goingError) {
    return respond(500, { message: fakeOptions.goingError });
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

// Event 1's chat: yesterday's planning, then two messages from Alex this
// morning that John hasn't read. Ids sort in sending order, like real ones.
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000).toISOString();
const chatMessage = (id, user, name, text, minutes) => ({ _id: id, sender: { user, name }, text, createdAt: minutesAgo(minutes) });

const demoChats = () => ({
  '1': [
    chatMessage('c001', 'u2', 'Alex', 'Has anyone looked at the schedule?', 26 * 60),
    chatMessage('c002', 'u3', 'Taylor', "I'm going to Tame Impala too.", 26 * 60 - 2),
    chatMessage('c003', 'u1', 'John Doe', "Let's meet at the main stage at 1:30.", 26 * 60 - 4),
    chatMessage('c004', 'u2', 'Alex', "Who's bringing a charger?", 30),
    chatMessage('c005', 'u2', 'Alex', 'I can grab snacks too.', 29)
  ]
});

let chats = demoChats();
// John's read point in each chat
let chatReads = { '1': 'c003' };
let nextMessageId = 100;

const messagesFor = (eventId) => {
  chats[eventId] = chats[eventId] || [];
  return chats[eventId];
};

// Someone else changing an event on the server while the app is open
export const changeEvent = (eventId, change) => {
  const event = events.find((e) => e._id === eventId);
  change(event);
  return event;
};

// What the server has for an event right now, to check the app agrees
export const serverEvent = (eventId) => events.find((e) => e._id === eventId);

// Someone else deleting an event, or removing you from it
export const removeEvent = (eventId) => {
  events = events.filter((e) => e._id !== eventId);
};

// Holds the response to the next matching request: the server answers
// straight away, but the answer only reaches the app on release(). For
// testing a slow read that lands after something newer.
let holds = [];
export const holdNext = (method, path) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  holds.push({ method, path, gate });
  return () => act(async () => {
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

// Holds the next matching request on its way: the server only sees it on
// release(). For testing a write that hasn't been applied yet while other
// requests (a background refresh) get there first.
let delays = [];
export const delayNext = (method, path) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  delays.push({ method, path, gate });
  return () => act(async () => {
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

// Makes the next matching request fail, as if the server were down. For
// testing that a failed refresh leaves what's on screen alone.
let failures = [];
export const failNext = (method, path, status = 503) => {
  failures.push({ method, path, status });
};

// A message from someone else arriving while the app is open
export const receiveMessage = (eventId, { user = 'u2', name = 'Alex', text }) => {
  const message = chatMessage(`c${nextMessageId++}`, user, name, text, 0);
  messagesFor(eventId).push(message);
  return message;
};

const CHAT_PAGE = 50;

const chatRoute = (event, method, action, body, params) => {
  const messages = messagesFor(event._id);
  if (action === 'read' && method === 'PUT') {
    chatReads[event._id] = body.lastRead > (chatReads[event._id] || '') ? body.lastRead : chatReads[event._id];
    return respond(204);
  }
  if (method === 'POST') {
    const saved = body.clientId && messages.find((m) => m.clientId === body.clientId);
    if (saved) return respond(200, { message: saved });
    if (fakeOptions.chatSendError) return respond(503, { message: fakeOptions.chatSendError });
    const message = { ...chatMessage(`c${nextMessageId++}`, demoUser._id, demoUser.name, body.text.trim(), 0), clientId: body.clientId };
    messages.push(message);
    // options.chatSendsLost: that many sends are saved but their response is lost
    if (fakeOptions.chatSendsLost > 0) {
      fakeOptions.chatSendsLost -= 1;
      return Promise.reject(new TypeError('Network request failed'));
    }
    return respond(201, { message });
  }
  if (params.has('after')) {
    return respond(200, { messages: messages.filter((m) => m._id > params.get('after')) });
  }
  const older = params.has('before') ? messages.filter((m) => m._id < params.get('before')) : messages;
  return respond(200, { messages: older.slice(-CHAT_PAGE), hasMore: older.length > CHAT_PAGE });
};

const chatList = () => {
  const list = events.filter(isMember).map((event) => {
    const messages = messagesFor(event._id);
    const read = chatReads[event._id] || '';
    return {
      eventId: event._id,
      name: event.name,
      type: event.type || 'music-festival',
      coverIndex: event.coverIndex ?? 0,
      startDate: event.startDate,
      endDate: event.endDate,
      memberCount: event.members.length,
      lastMessage: messages.at(-1) || null,
      unread: messages.filter((m) => m._id > read && m.sender.user !== demoUser._id).length
    };
  });
  return respond(200, { chats: list });
};

// options.liveEvent adds a picnic happening today, where Alex is sharing
// his location and Taylor set a meetup point
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const picnicEvent = () => ({
  _id: '5',
  inviteCode: 'picnic-code',
  name: 'Picnic in the Park',
  type: 'outdoor',
  startDate: localToday(),
  endDate: localToday(),
  location: 'Piedmont Park, Atlanta, GA',
  members: [taylor, me, alex],
  schedule: [],
  createdBy: 'u3'
});

const demoLive = () => ({
  '5': {
    sharing: null,
    people: [{
      user: 'u2', name: 'Alex', color: '#3b82f6', lat: 33.7866, lng: -84.3727, accuracy: 10,
      positionAt: minutesAgo(2), until: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
    }],
    meetup: {
      lat: 33.7857, lng: -84.3741, note: 'By the lake', time: '',
      setBy: { user: 'u3', name: 'Taylor' }, setAt: minutesAgo(20)
    }
  }
});

let live = {};

const liveRoute = (event, method, action, body) => {
  const state = live[event._id] = live[event._id] || { sharing: null, people: [], meetup: null };
  if (!action && method === 'GET') return respond(200, state);
  if (action === 'share' && method === 'PUT') {
    state.sharing = { until: body.until };
    return respond(200, { sharing: state.sharing });
  }
  if (action === 'share' && method === 'DELETE') {
    // options.stopShareFails: that many stops fail, as if offline
    if (fakeOptions.stopShareFails > 0) {
      fakeOptions.stopShareFails -= 1;
      return respond(503, { message: 'Service unavailable' });
    }
    state.sharing = null;
    return respond(204);
  }
  if (action === 'position' && method === 'PUT') {
    return state.sharing ? respond(204) : respond(409, { message: "You're not sharing your location right now." });
  }
  if (action === 'meetup' && method === 'PUT') {
    state.meetup = { ...body, setBy: { user: demoUser._id, name: demoUser.name }, setAt: new Date().toISOString() };
    return respond(200, { meetup: state.meetup });
  }
  if (action === 'meetup' && method === 'DELETE') {
    state.meetup = null;
    return respond(204);
  }
  return respond(404, { message: 'Not found.' });
};

let fakeOptions = {};

const discoverRoute = (path, params) => {
  if (path === '/discover/place') {
    if (params.has('q')) {
      const q = params.get('q');
      if (/nowhere/i.test(q)) return respond(404, { message: `Couldn't find "${q}". Try a city name or ZIP code.` });
      return respond(200, { place: { label: q === '30030' ? 'Decatur, GA' : 'Atlanta, GA', lat: 33.77, lng: -84.3 } });
    }
    return respond(200, { place: { label: 'Atlanta, GA', lat: Number(params.get('lat')), lng: Number(params.get('lng')) } });
  }
  if (fakeOptions.discoverError) return respond(503, { message: fakeOptions.discoverError });
  if (fakeOptions.noLocalEvents) return respond(200, { events: [], attribution: 'Ticketmaster' });
  const category = params.get('category') || 'all';
  const events = category === 'all' ? localEvents : localEvents.filter((e) => CATEGORY_TYPES[category].includes(e.type));
  return respond(200, { events, attribution: 'Ticketmaster' });
};

const route = (method, path, body, authed, params) => {
  // options.demo: the server runs in demo mode (one-tap demo sign-in)
  if (path === '/health') return respond(200, { status: 'ok', demo: Boolean(fakeOptions.demo) });
  if (method === 'POST' && path === '/auth/demo') {
    return fakeOptions.demo ? respond(201, { token: TOKEN, user: currentUser() }) : respond(404, { message: 'Not found.' });
  }
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

  if (path.startsWith('/discover/')) return discoverRoute(path, params);

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
  if (path === '/events') {
    if (fakeOptions.eventsFailures > 0) {
      fakeOptions.eventsFailures -= 1;
      return respond(503, { message: 'Service unavailable' });
    }
    return respond(200, { events: events.filter(isMember) });
  }
  if (path === '/chats') return chatList();
  if (path === '/map/events') {
    return respond(200, {
      events: events.filter(isMember).map(({ _id, name, type, startDate, endDate, location }) => {
        const [lat, lng] = EVENT_POSITIONS[_id] || [null, null];
        return { _id, name, type: type || 'music-festival', startDate, endDate, location, lat, lng };
      })
    });
  }

  // /events/:id/live[/share|/position|/meetup]
  const liveMatch = path.match(/^\/events\/([^/]+)\/live(?:\/(share|position|meetup))?$/);
  if (liveMatch) {
    const event = events.find((e) => e._id === decodeURIComponent(liveMatch[1]) && isMember(e));
    if (!event) return respond(404, { message: 'Event not found.' });
    return liveRoute(event, method, liveMatch[2], body);
  }

  // /events/:id/messages[/read]
  const chatMatch = path.match(/^\/events\/([^/]+)\/messages(?:\/(read))?$/);
  if (chatMatch) {
    const event = events.find((e) => e._id === decodeURIComponent(chatMatch[1]) && isMember(e));
    if (!event) return respond(404, { message: 'Event not found.' });
    return chatRoute(event, method, chatMatch[2], body, params);
  }

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
        isMember: isMember(event),
        isRemoved: (event.removed || []).some((r) => r.user === demoUser._id)
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

  // /events/:id/members/:userId: leave (your own id) or remove someone
  const memberMatch = path.match(/^\/events\/([^/]+)\/members\/([^/]+)$/);
  if (memberMatch && method === 'DELETE') {
    const event = events.find((e) => e._id === memberMatch[1] && isMember(e));
    if (!event) return respond(404, { message: 'Event not found.' });
    // options.memberRemovalError: the balance isn't settled
    if (fakeOptions.memberRemovalError) return respond(409, { message: fakeOptions.memberRemovalError });
    const member = event.members.find((m) => m.user === memberMatch[2]);
    if (member.user !== demoUser._id) event.removed = [...(event.removed || []), { user: member.user, name: member.name }];
    event.members = event.members.filter((m) => m !== member);
    return respond(204);
  }

  // /events/:id/removed[/:userId]: the organizer's list of removed people
  const removedMatch = path.match(/^\/events\/([^/]+)\/removed(?:\/([^/]+))?$/);
  if (removedMatch) {
    const event = events.find((e) => e._id === removedMatch[1] && isMember(e));
    if (!event) return respond(404, { message: 'Event not found.' });
    if (method === 'DELETE') {
      event.removed = (event.removed || []).filter((r) => r.user !== removedMatch[2]);
      return respond(204);
    }
    return respond(200, { removed: event.removed || [] });
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
  if (method === 'DELETE') {
    events = events.filter((e) => e !== event);
    return respond(204);
  }
  if (method === 'PATCH') Object.assign(event, body);
  return respond(200, { event });
};

// Installs the fake with fresh data. Returns logIn(), which saves a session
// the way a past login would have, so the app opens already logged in.
// options.handles replaces the starting payment handles ({ userId: handles });
// options.noLocalEvents / options.discoverError change Discover's results;
// options.chats replaces the starting chats ({ eventId: [messages] });
// options.chatSendError makes sending a message fail with that message;
// options.chatSendsLost saves that many sends but loses their responses;
// options.paymentOutcomes lists what each payment meets ('lost', or a status);
// options.goingError makes toggling Going fail with that message;
// options.memberRemovalError makes leaving or removing fail with that message;
// options.stopShareFails makes that many stop-sharing requests fail;
// options.liveEvent adds an event happening today with live locations;
// options.eventsFailures makes loading your events fail that many times
// Lets requests still in flight (like a screen's background counts) finish
// inside act, for tests that end before they would otherwise land
export const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

export const installFakeApi = (options = {}) => {
  fakeOptions = { ...options };
  events = options.liveEvent ? [...demoEvents(), picnicEvent()] : demoEvents();
  live = options.liveEvent ? demoLive() : {};
  chats = options.chats || demoChats();
  chatReads = options.chats ? {} : { '1': 'c003' };
  ledgers = demoLedger();
  handles = { ...demoHandles(), ...options.handles };
  holds = [];
  delays = [];
  failures = [];
  const serve = (url, method, headers, body) => {
    const [path, search = ''] = url.replace(/^\/api/, '').split('?');
    const response = route(
      method,
      path,
      body ? JSON.parse(body) : undefined,
      headers.Authorization === `Bearer ${TOKEN}`,
      new URLSearchParams(search)
    );
    const held = holds.findIndex((h) => h.method === method && h.path === path);
    if (held === -1) return response;
    const [{ gate }] = holds.splice(held, 1);
    return gate.then(() => response);
  };
  global.fetch = jest.fn((url, { method = 'GET', headers = {}, body } = {}) => {
    const path = url.replace(/^\/api/, '').split('?')[0];
    const failed = failures.findIndex((f) => f.method === method && f.path === path);
    if (failed !== -1) {
      const [{ status }] = failures.splice(failed, 1);
      return respond(status, { message: 'Service unavailable' });
    }
    const delayed = delays.findIndex((d) => d.method === method && d.path === path);
    if (delayed === -1) return serve(url, method, headers, body);
    const [{ gate }] = delays.splice(delayed, 1);
    return gate.then(() => serve(url, method, headers, body));
  });

  return {
    logIn: () => {
      localStorage.setItem('eventbuddy_token', TOKEN);
      localStorage.setItem('eventbuddy_user', JSON.stringify(currentUser()));
    }
  };
};
