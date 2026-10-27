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
//
// Everything is in this process's memory, which fits the single instance
// Render runs. A second instance would need pub/sub (Redis, say) so a change
// on one reaches sockets held by the other.
const mongoose = require('mongoose');
const { WebSocketServer, WebSocket } = require('ws');
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const { findVisibleEvent } = require('../eventAccess');

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
  pingMs: 30000
};

let state = null;

// Bumped whenever access is taken away (a member removed, a login ended).
// A check that was waiting on the database while it changed is run again,
// so it can't add back what was just taken away.
let revocations = 0;

const send = (ws, message) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
};

const reject = (socket, status) => {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
};

// Runs check until no access was taken away while it ran
const checked = async (check) => {
  for (let tries = 0; tries < 3; tries += 1) {
    const seen = revocations;
    const result = await check();
    if (seen === revocations) return result;
  }
  throw new Error('Access kept changing.');
};

const subscribersOf = (eventId) => state.subscribers.get(eventId) || new Set();

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
  const sockets = state?.users.get(ws.userId);
  sockets?.delete(ws);
  if (sockets?.size === 0) state.users.delete(ws.userId);
};

const logIn = async (ws, token) => {
  let user;
  try {
    user = await checked(() => authenticate(token));
  } catch {
    ws.close(ENDED, 'Please log in.');
    return;
  }
  if (ws.readyState !== WebSocket.OPEN) return;

  clearTimeout(ws.authTimer);
  ws.user = user;
  ws.userId = user._id.toString();
  const sockets = state.users.get(ws.userId) || new Set();
  state.users.set(ws.userId, sockets);
  // A phone that reconnected many times shouldn't lock itself out behind
  // its own dead sockets, so the oldest goes
  // Forgotten at once rather than when its close finishes, which a client
  // that ignores the close could put off: it stops counting and hearing now
  if (sockets.size >= state.limits.socketsPerUser) {
    const oldest = sockets.values().next().value;
    forget(oldest);
    oldest.close(REPLACED, 'Opened somewhere else.');
  }
  sockets.add(ws);
  send(ws, { type: 'ready' });
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
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.events.add(eventId);
  if (!state.subscribers.has(eventId)) state.subscribers.set(eventId, new Set());
  state.subscribers.get(eventId).add(ws);
  send(ws, { type: 'subscribed', eventId });
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

  state = { wss, server, onUpgrade, heartbeat, limits: merged, users: new Map(), subscribers: new Map() };
};

const close = () => {
  if (!state) return;
  clearInterval(state.heartbeat);
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
  revocations += 1;
  if (!state) return;
  const id = String(eventId);
  const leaving = userIds && new Set(userIds.map(String));
  [...subscribersOf(id)].forEach((ws) => {
    if (leaving && !leaving.has(ws.userId)) return;
    EVERYTHING.forEach((what) => send(ws, { type: 'changed', eventId: id, what }));
    unsubscribe(ws, id);
  });
};

// Closes every socket of these people: their login ended
const closeUsers = (userIds, code = ENDED) => {
  revocations += 1;
  if (!state) return;
  userIds.forEach((userId) => {
    state.users.get(String(userId))?.forEach((ws) => ws.close(code, 'Please log in.'));
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

module.exports = { attach, close, notifyEvent, notifyUsers, dropFromEvent, closeUsers, pokeOnSuccess, PATH, ENDED, REPLACED };
