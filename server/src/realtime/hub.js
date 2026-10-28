// Real-time pokes over a WebSocket at /api/socket.
//
// The socket never carries app data. When something changes, subscribers
// get { type: 'changed', eventId, what } and the app runs the same REST
// read it would have run on its next poll. So every access check, and all
// the app's handling of late or overlapping answers, stays where it is, and
// a slip here could reveal at most that something changed.
//
// Conversation, once connected:
//   app → { type: 'auth', token }        first, within a few seconds
//   hub → { type: 'ready' }
//   app → { type: 'subscribe', eventId }  checked like a REST read
//   hub → { type: 'subscribed', eventId } or { type: 'denied', eventId }
//   hub → { type: 'changed', eventId, what: 'chat' | 'live' | 'event' }
//   hub → { type: 'changed', what: 'events' }  your list of events changed
//   hub → { type: 'presence', eventId, userIds }  members with the app open
//
// Presence is the one thing beyond pokes: user ids, sent only to the
// event's own subscribers, which says no more than "this member has the app
// open". The socket is only open while the app is on screen, so being
// connected is what being here means. A private demo world's scripted
// friends can be "here" too, kept apart from real connections so that
// ending the pretence never ends anyone's real presence (see demoFriends.js).
//
// Everything is in this process's memory, which fits the single instance
// Render runs. A second instance would need pub/sub (Redis, say) so a change
// on one reaches sockets held by the other.
const { EventEmitter } = require('events');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { WebSocketServer, WebSocket } = require('ws');
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const Event = require('../models/Event');
const { findVisibleEvent, visibleTo } = require('../eventAccess');

const PATH = '/api/socket';

// Close codes the app acts on: 4401 means log in again (with a new token,
// if it has one), 4409 means this device opened too many sockets
const ENDED = 4401;
const REPLACED = 4409;
const POLICY = 1008;

// Everything a screen of one event reads
const EVERYTHING = ['event', 'live', 'chat'];

const LIMITS = {
  messageBytes: 1024,
  socketsPerUser: 5,
  subscriptionsPerSocket: 20,
  // Refused subscribes each cost a query, so a socket that keeps asking for
  // events it can't see is closed
  denialsPerSocket: 20,
  // Unauthenticated sockets count too, so they can't pile up
  sockets: 500,
  authMs: 5000,
  pingMs: 30000,
  // Someone who closes the app stays here this long, so flicking to another
  // app and straight back doesn't flash them away for everyone
  leaveGraceMs: 5000
};

let state = null;

// What happens at the hub, for code that reacts to it (the demo friends).
// 'subscribed' (user, eventId): a socket joined an event's screen.
// 'left' (userId): someone really stopped being here, past the grace.
const emitter = new EventEmitter();

// A listener that throws must never break the hub, which runs outside
// Express where an error would take the whole API down
const announce = (name, ...args) => {
  try {
    emitter.emit(name, ...args);
  } catch (err) {
    console.error(`A real-time listener failed (${name}):`, err.message);
  }
};

// Bumped whenever who may see what changes: a member removed or added, a
// login ended, someone's presence ending. A check that was waiting on the
// database while it changed is run again, so it can't add back what was
// just taken away, or miss what was just given.
let accessChanges = 0;

// Nothing goes to a socket whose login has run out, even in the moment
// before its expiry timer gets to run
const send = (ws, message) => {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (hasExpired(ws)) return expire(ws);
  ws.send(JSON.stringify(message));
};

const reject = (socket, status) => {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
};

// Runs check until no access changed while it ran
const checked = async (check) => {
  for (let tries = 0; tries < 3; tries += 1) {
    const seen = accessChanges;
    const result = await check();
    if (seen === accessChanges) return result;
  }
  throw new Error('Access kept changing.');
};

const subscribersOf = (eventId) => state.subscribers.get(eventId) || new Set();

// Members of the event who are here: memberships holds the events of
// everyone with the app open (or who closed it moments ago), and simulated
// those of a demo world's scripted friends
const presenceOf = (eventId) => {
  const here = (map) => [...map].filter(([, ids]) => ids.has(eventId)).map(([userId]) => userId);
  return [...new Set([...here(state.memberships), ...here(state.simulated)])];
};

const sendPresence = (eventId, to = subscribersOf(eventId)) => {
  const message = { type: 'presence', eventId, userIds: presenceOf(eventId) };
  to.forEach((ws) => send(ws, message));
};

// They're no longer here, straight away: their login ended
const endPresence = (userId) => {
  // A login in flight for them must load their events again
  accessChanges += 1;
  const events = state.memberships.get(userId) || new Set();
  state.memberships.delete(userId);
  clearTimeout(state.leaving.get(userId));
  state.leaving.delete(userId);
  events.forEach((eventId) => sendPresence(eventId));
  announce('left', userId);
};

// After the grace, if they haven't come back, they're no longer here
const leaveLater = (userId) => {
  state.leaving.set(userId, setTimeout(() => {
    state.leaving.delete(userId);
    if (state.users.has(userId)) return;
    accessChanges += 1;
    const events = state.memberships.get(userId) || new Set();
    state.memberships.delete(userId);
    events.forEach((eventId) => sendPresence(eventId));
    announce('left', userId);
  }, state.limits.leaveGraceMs));
};

const unsubscribe = (ws, eventId) => {
  ws.events.delete(eventId);
  const subscribers = state.subscribers.get(eventId);
  subscribers?.delete(ws);
  if (subscribers?.size === 0) state.subscribers.delete(eventId);
};

const forget = (ws) => {
  // Sockets closed by close() go after the hub's state does
  if (!state) return;
  [...ws.events].forEach((eventId) => unsubscribe(ws, eventId));
  const sockets = state.users.get(ws.userId);
  if (!sockets?.delete(ws) || sockets.size > 0) return;
  state.users.delete(ws.userId);
  if (state.memberships.has(ws.userId) && !state.leaving.has(ws.userId)) leaveLater(ws.userId);
};

const logIn = async (ws, token) => {
  // The login, and (if they're arriving) which of their events will see
  // them here, are checked together: a logout, removal or join while either
  // is loading makes both load again. Everything after this is synchronous,
  // so nothing can change between the check and the socket being counted.
  let user;
  let events;
  try {
    ({ user, events } = await checked(async () => {
      const found = await authenticate(token);
      const arriving = !state.memberships.has(found._id.toString());
      return { user: found, events: arriving ? await Event.find(visibleTo(found), '_id') : null };
    }));
  } catch {
    ws.close(ENDED, 'Please log in.');
    return;
  }
  if (!state || ws.readyState !== WebSocket.OPEN) return;
  const userId = user._id.toString();
  // The token was verified above, so its expiry can be read without
  // checking it again. It may have run out while its events were loading.
  const { exp } = jwt.decode(token);
  ws.expiresAt = exp ? exp * 1000 : Infinity;
  if (hasExpired(ws)) return ws.close(ENDED, 'Please log in again.');

  // Their events are kept current from here on as they join and leave
  const arrived = Boolean(events) && !state.memberships.has(userId);
  if (arrived) state.memberships.set(userId, new Set(events.map((e) => e._id.toString())));
  // Back within the grace: they never left
  clearTimeout(state.leaving.get(userId));
  state.leaving.delete(userId);

  clearTimeout(ws.authTimer);
  ws.user = user;
  ws.userId = userId;
  const sockets = state.users.get(ws.userId) || new Set();
  state.users.set(ws.userId, sockets);
  sockets.add(ws);
  // A phone that reconnected many times shouldn't lock itself out behind
  // its own dead sockets, so the oldest goes. It's forgotten at once rather
  // than when its close finishes, which a client that ignores the close
  // could put off: it stops counting and hearing now. The new one is
  // already counted, so this never looks like the person leaving.
  if (sockets.size > state.limits.socketsPerUser) {
    const oldest = sockets.values().next().value;
    forget(oldest);
    oldest.close(REPLACED, 'Opened somewhere else.');
  }
  // Only once it's counted, so expiring takes it out again cleanly
  if (ws.expiresAt !== Infinity) closeAtExpiry(ws);
  send(ws, { type: 'ready' });
  if (arrived) state.memberships.get(userId).forEach((eventId) => sendPresence(eventId));
};

// A socket lives no longer than the login it was opened with: when the
// token expires, so does the socket, as REST would refuse it from then on.
// setTimeout can't wait longer than about 24.8 days, so a longer token
// re-arms on the way (not covered by a test: it would need a fake clock).
const MAX_TIMER_MS = 2 ** 31 - 1;
const hasExpired = (ws) => Date.now() >= ws.expiresAt;
// Like a logout for this one socket: it stops hearing anything now, and if
// it was their last, they stop being here now too, without the grace
const expire = (ws) => {
  forget(ws);
  if (state && !state.users.has(ws.userId)) endPresence(ws.userId);
  ws.close(ENDED, 'Please log in again.');
};
const closeAtExpiry = (ws) => {
  const wait = ws.expiresAt - Date.now();
  if (wait <= 0) return expire(ws);
  ws.expiryTimer = setTimeout(() => closeAtExpiry(ws), Math.min(wait, MAX_TIMER_MS));
};

const deny = (ws, eventId) => {
  ws.denials += 1;
  if (ws.denials > state.limits.denialsPerSocket) return ws.close(POLICY, 'Too many refused subscriptions.');
  send(ws, { type: 'denied', eventId });
};

const subscribe = async (ws, eventId) => {
  if (ws.events.has(eventId)) return send(ws, { type: 'subscribed', eventId });
  if (!mongoose.isValidObjectId(eventId) || ws.events.size >= state.limits.subscriptionsPerSocket) {
    return deny(ws, eventId);
  }
  try {
    await checked(() => findVisibleEvent(eventId, ws.user));
  } catch {
    return deny(ws, eventId);
  }
  // The login may have run out while the check was waiting on the database
  if (hasExpired(ws)) return expire(ws);
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.events.add(eventId);
  if (!state.subscribers.has(eventId)) state.subscribers.set(eventId, new Set());
  state.subscribers.get(eventId).add(ws);
  send(ws, { type: 'subscribed', eventId });
  sendPresence(eventId, [ws]);
  announce('subscribed', ws.user, eventId);
};

const handle = async (ws, data, isBinary) => {
  let message;
  try {
    message = isBinary ? null : JSON.parse(data);
  } catch {
    // Not JSON: ignored, like any message we don't know
  }
  if (!message || typeof message !== 'object') return;

  if (!ws.userId) {
    if (message.type === 'auth' && typeof message.token === 'string') return logIn(ws, message.token);
    return ws.close(ENDED, 'Please log in.');
  }
  if (hasExpired(ws)) return expire(ws);
  const eventId = typeof message.eventId === 'string' ? message.eventId : '';
  if (message.type === 'subscribe') return subscribe(ws, eventId);
  if (message.type === 'unsubscribe') return unsubscribe(ws, eventId);
};

const onConnection = (ws) => {
  ws.events = new Set();
  ws.denials = 0;
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.authTimer = setTimeout(() => ws.close(ENDED, 'Please log in.'), state.limits.authMs);
  // One message at a time, so a subscribe can't overtake the login before it
  let queue = Promise.resolve();
  ws.on('message', (data, isBinary) => {
    queue = queue.then(() => handle(ws, data, isBinary)).catch(() => {});
  });
  ws.on('close', () => {
    clearTimeout(ws.authTimer);
    clearTimeout(ws.expiryTimer);
    forget(ws);
  });
  // An oversized message is reported here before the socket closes
  ws.on('error', () => {});
};

// Starts accepting sockets on an HTTP server. Options are for tests.
const attach = (server, { limits = {}, origins = config.clientOrigin } = {}) => {
  if (state) throw new Error('The real-time hub is already attached.');
  const merged = { ...LIMITS, ...limits };
  const wss = new WebSocketServer({ noServer: true, maxPayload: merged.messageBytes });

  // An Origin that isn't the web app (or the iPhone app) is a page on some
  // other site. The login travels in a message, not a cookie, so such a page
  // couldn't act as anyone, but there's no reason to let it connect. Native
  // apps and scripts send no Origin.
  const onUpgrade = (req, socket, head) => {
    // Nothing here may throw: this runs outside Express, so an error would
    // be uncaught and take the whole API down. Node accepts request lines
    // that URL can't parse.
    let pathname;
    try {
      ({ pathname } = new URL(req.url, 'http://localhost'));
    } catch {
      return socket.destroy();
    }
    if (pathname !== PATH) return socket.destroy();
    const { origin } = req.headers;
    if (origin && !origins.includes(origin)) return reject(socket, '403 Forbidden');
    if (wss.clients.size >= merged.sockets) return reject(socket, '503 Service Unavailable');
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  };
  server.on('upgrade', onUpgrade);
  wss.on('connection', onConnection);

  // A phone that lost signal never says goodbye; one missed pong and it goes
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.alive) return ws.terminate();
      ws.alive = false;
      ws.ping();
    });
  }, merged.pingMs);
  heartbeat.unref();

  state = {
    wss, server, onUpgrade, heartbeat, limits: merged,
    users: new Map(), subscribers: new Map(), memberships: new Map(), leaving: new Map(), simulated: new Map()
  };
};

const close = () => {
  if (!state) return;
  clearInterval(state.heartbeat);
  state.leaving.forEach((timer) => clearTimeout(timer));
  state.server.off('upgrade', state.onUpgrade);
  state.wss.clients.forEach((ws) => ws.terminate());
  state.wss.close();
  state = null;
};

// Everything below does nothing while no hub is attached (the API tests that
// call the app directly), since nobody could be listening

const notifyEvent = (eventId, what) => {
  if (!state) return;
  const id = String(eventId);
  subscribersOf(id).forEach((ws) => send(ws, { type: 'changed', eventId: id, what }));
};

const notifyUsers = (userIds) => {
  if (!state) return;
  userIds.forEach((userId) => {
    state.users.get(String(userId))?.forEach((ws) => send(ws, { type: 'changed', what: 'events' }));
  });
};

// Stops pokes about an event reaching these people (removed), or anyone
// (deleted). Each gets a last poke for everything first, so whatever
// screen of it they have open reads it now, finds it gone and says so,
// rather than showing it until its next poll.
const dropFromEvent = (eventId, userIds) => {
  accessChanges += 1;
  if (!state) return;
  const id = String(eventId);
  const leaving = userIds && new Set(userIds.map(String));
  [...subscribersOf(id)].forEach((ws) => {
    if (leaving && !leaving.has(ws.userId)) return;
    EVERYTHING.forEach((what) => send(ws, { type: 'changed', eventId: id, what }));
    unsubscribe(ws, id);
  });
  // Nor are they here for it any more, really or pretending
  [state.memberships, state.simulated].forEach((map) => {
    map.forEach((ids, userId) => {
      if (!leaving || leaving.has(userId)) ids.delete(id);
    });
  });
  if (leaving) sendPresence(id);
};

// Someone joined (or made) an event: if they have the app open, they're
// here for it now
const addMember = (eventId, userId) => {
  accessChanges += 1;
  if (!state) return;
  const id = String(eventId);
  state.memberships.get(String(userId))?.add(id);
  sendPresence(id);
};

// Scripted friends are here for an event, or no longer. They live apart from
// real connections, so ending one can't end a real person's presence.
const simulatePresence = (userIds, eventId) => {
  if (!state) return;
  const id = String(eventId);
  userIds.map(String).forEach((userId) => {
    if (!state.simulated.has(userId)) state.simulated.set(userId, new Set());
    state.simulated.get(userId).add(id);
  });
  sendPresence(id);
};

const endSimulatedPresence = (userIds, eventId) => {
  if (!state) return;
  const id = String(eventId);
  userIds.map(String).forEach((userId) => {
    const ids = state.simulated.get(userId);
    ids?.delete(id);
    if (ids?.size === 0) state.simulated.delete(userId);
  });
  sendPresence(id);
};

// Where the attached server can be reached from this machine, for code that
// calls the API's own routes; null while it isn't listening
const localUrl = () => {
  const address = state?.server.address();
  return address && typeof address === 'object' ? `http://127.0.0.1:${address.port}` : null;
};

// Closes every socket of these people: their login ended. They stop being
// here at once; the grace is for flicking between apps, not for logging out.
const closeUsers = (userIds, code = ENDED) => {
  accessChanges += 1;
  if (!state) return;
  userIds.map(String).forEach((userId) => {
    state.users.get(userId)?.forEach((ws) => ws.close(code, 'Please log in.'));
    endPresence(userId);
  });
};

// Middleware for an event's nested routes (/api/events/:id/...): once a
// change has succeeded, poke the event's subscribers. A read changes
// nothing, and neither does a refused change. what is the poke, or a
// function of the request giving one, several, or null for a write nobody
// else needs to hear about.
const pokeOnSuccess = (what) => (req, res, next) => {
  const whats = req.method === 'GET' ? [] : [].concat((typeof what === 'function' ? what(req) : what) || []);
  if (whats.length > 0) {
    const eventId = req.params.id;
    res.on('finish', () => {
      if (res.statusCode < 400) whats.forEach((w) => notifyEvent(eventId, w));
    });
  }
  next();
};

module.exports = {
  attach, close, notifyEvent, notifyUsers, dropFromEvent, addMember, closeUsers, pokeOnSuccess,
  hubEvents: emitter, simulatePresence, endSimulatedPresence, localUrl, PATH, ENDED, REPLACED
};
