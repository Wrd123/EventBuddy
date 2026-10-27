// One real-time socket per login, which pokes the app to read again.
//
// The server never sends data down it, only "something changed" (see
// server/src/realtime/hub.js). A screen that hears its poke runs the same
// read it polls with, so nothing about how answers are applied changes. If
// the socket can't connect (offline, a proxy that blocks it, a server
// asleep), polling carries on as it always has.
import { API_URL, TOKEN_KEY } from './api';

export const isVisible = () => document.visibilityState !== 'hidden';

// The server's close codes: the login ended, or this device opened too
// many sockets and this was the oldest
const ENDED = 4401;
const REPLACED = 4409;

const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;

// ws(s)://<the API's host>/api/socket. A relative API address (the web
// app in development, behind CRA's proxy) is on the page's own host.
export const socketUrl = (apiUrl = API_URL, pageUrl = window.location.href) => {
  const url = new URL(apiUrl, pageUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/socket`;
  return url.toString();
};

// Whether this login wants a socket at all (false once logged out, or the
// server said the login ended)
let wanted = false;
let socket = null;
let connected = false;
let retryTimer = null;
let retryMs = FIRST_RETRY_MS;
const watchers = new Set();
const statusListeners = new Set();
// Events the server confirmed it will poke this socket about. A refused
// subscription (or one not answered yet) gets no pokes, so its screens
// keep polling at their own pace.
const covered = new Set();
// Who has the app open, by event: user ids, as the server last said
const presence = new Map();

const send = (ws, message) => ws.send(JSON.stringify(message));

const watchedEvents = () => new Set([...watchers].map((w) => w.eventId).filter(Boolean));

const changed = () => statusListeners.forEach((listener) => listener());

const setConnected = (value) => {
  if (connected === value) return;
  connected = value;
  // Nobody is better than dots that may be stale
  if (!value) {
    covered.clear();
    presence.clear();
  }
  changed();
};

const setCovered = (eventId, isCovered) => {
  if (covered.has(eventId) === isCovered) return;
  if (isCovered) covered.add(eventId);
  else covered.delete(eventId);
  changed();
};

const heard = (message) => {
  watchers.forEach((w) => {
    const forMe = message.what === 'events'
      ? w.what === 'events'
      : w.eventId === message.eventId && w.what === message.what;
    if (forMe) w.onPoke();
  });
};

const retryLater = () => {
  clearTimeout(retryTimer);
  // Jittered, so phones that lost the server together don't all come back
  // in the same instant
  retryTimer = setTimeout(connect, retryMs * (0.5 + Math.random() / 2));
  retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
};

const disconnect = () => {
  clearTimeout(retryTimer);
  retryTimer = null;
  const ws = socket;
  // Cleared first, so this socket's own close event is ignored
  socket = null;
  ws?.close();
  setConnected(false);
};

function connect() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!wanted || socket || !token || !isVisible()) return;

  let ws;
  try {
    ws = new WebSocket(socketUrl());
  } catch {
    retryLater();
    return;
  }
  socket = ws;
  // Every handler checks it's still the current socket: one left over from
  // an earlier login, or from before the app was hidden, has no say
  ws.onopen = () => {
    if (socket === ws) send(ws, { type: 'auth', token });
  };
  ws.onmessage = ({ data }) => {
    if (socket !== ws) return;
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (message.type === 'ready') {
      retryMs = FIRST_RETRY_MS;
      watchedEvents().forEach((eventId) => send(ws, { type: 'subscribe', eventId }));
      setConnected(true);
    } else if (message.type === 'subscribed' || message.type === 'denied') {
      // Only if it's still wanted: an unsubscribe may have crossed it
      setCovered(message.eventId, message.type === 'subscribed' && watchedEvents().has(message.eventId));
    } else if (message.type === 'changed') {
      heard(message);
    } else if (message.type === 'presence' && watchedEvents().has(message.eventId) && Array.isArray(message.userIds)) {
      presence.set(message.eventId, message.userIds);
      changed();
    }
  };
  ws.onclose = ({ code }) => {
    if (socket !== ws) return;
    socket = null;
    setConnected(false);
    // Not worth retrying. If the login really ended, the next request gets
    // a 401 and the app logs out as it always has; the socket never does.
    if (code === ENDED || code === REPLACED) {
      wanted = false;
      return;
    }
    retryLater();
  };
}

const onVisibility = () => {
  // Hidden apps don't need pokes, and a phone shouldn't hold a connection
  // open in someone's pocket. Polling stops then too.
  if (isVisible()) {
    retryMs = FIRST_RETRY_MS;
    connect();
  } else {
    disconnect();
  }
};

// For a new login, or the same person with a new token (after changing
// their password). Whatever socket was open belonged to the old one.
export const start = () => {
  disconnect();
  wanted = true;
  retryMs = FIRST_RETRY_MS;
  document.removeEventListener('visibilitychange', onVisibility);
  document.addEventListener('visibilitychange', onVisibility);
  connect();
};

export const stop = () => {
  wanted = false;
  document.removeEventListener('visibilitychange', onVisibility);
  disconnect();
};

export const isConnected = () => connected;

// Whether pokes about this event are reaching this phone
export const isCovered = (eventId) => connected && covered.has(eventId);

// Members of this event with the app open now (user ids), as far as this
// phone knows: none while it isn't connected
export const presenceOf = (eventId) => presence.get(eventId) || [];

// onStatus(listener) -> unlisten; listener() whenever the connection, or
// which events it covers, changes
export const onStatus = (listener) => {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
};

// Calls onPoke when the server says this changed: what is 'chat', 'live' or
// 'event' for eventId, or 'events' (no eventId) for your list of events.
// -> unwatch
export const watch = (eventId, what, onPoke) => {
  const watcher = { eventId: what === 'events' ? null : eventId, what, onPoke };
  const isNewEvent = watcher.eventId && !watchedEvents().has(watcher.eventId);
  watchers.add(watcher);
  if (isNewEvent && connected) send(socket, { type: 'subscribe', eventId: watcher.eventId });

  return () => {
    if (!watchers.delete(watcher)) return;
    if (watcher.eventId && connected && !watchedEvents().has(watcher.eventId)) {
      send(socket, { type: 'unsubscribe', eventId: watcher.eventId });
      presence.delete(watcher.eventId);
      setCovered(watcher.eventId, false);
    }
  };
};
