import { useEffect, useRef, useState } from 'react';
import * as realtime from '../services/realtime';

export const { isVisible } = realtime;

// While the real-time socket is up, a poll is only a safety net for a poke
// that went missing
export const CONNECTED_POLL_MS = 60000;
// Several pokes close together (a burst of chat) make one read, and one more
// after it for anything that changed meanwhile
const POKE_GAP_MS = 300;

// Whether pokes for this topic are reaching the phone now
const isCovered = (eventId, whats) => {
  if (whats === 'events') return realtime.isConnected();
  return Boolean(whats && eventId) && realtime.isCovered(eventId);
};

// Runs fn now and every intervalMs while the app is on screen, and again as
// soon as it comes back to the foreground. A phone in a pocket doesn't poll.
//
// topic, optional: the server's pokes for what fn reads (see
// services/realtime.js), which run fn at once.
//   { eventId, what }  what is 'chat', 'live' or 'event', or a list of them.
//     These pokes cover everything about the event that fn reads, so once
//     the server confirms it will send them, polling slows to a minute.
//   { what: 'events' }  someone joined, left or was removed. The list also
//     shows what's inside each event, which only that event's pokes cover,
//     so polling keeps its pace.
export const usePolling = (fn, intervalMs, topic) => {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const eventId = topic?.eventId;
  const whats = [].concat(topic?.what || []).join(',');
  const listens = whats === 'events' || Boolean(whats && eventId);
  const slows = listens && whats !== 'events';

  const [covered, setCovered] = useState(() => isCovered(eventId, whats));
  const ms = covered && slows ? Math.max(intervalMs, CONNECTED_POLL_MS) : intervalMs;

  useEffect(() => {
    const tick = () => isVisible() && fnRef.current();
    const timer = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms]);

  useEffect(() => {
    if (!listens) return undefined;
    let pending = null;
    let lastRun = 0;
    const run = () => {
      pending = null;
      lastRun = Date.now();
      if (isVisible()) fnRef.current();
    };
    const onPoke = () => {
      if (!pending) pending = setTimeout(run, Math.max(0, lastRun + POKE_GAP_MS - Date.now()));
    };
    const unwatches = whats.split(',').map((what) => realtime.watch(eventId, what, onPoke));
    let wasCovered = isCovered(eventId, whats);
    const unlisten = realtime.onStatus(() => {
      const nowCovered = isCovered(eventId, whats);
      if (nowCovered === wasCovered) return;
      wasCovered = nowCovered;
      setCovered(nowCovered);
      // Read now either way. Losing the socket means pokes stop arriving;
      // getting it back means pokes sent while it was down never arrived.
      onPoke();
    });
    setCovered(wasCovered);
    return () => {
      unwatches.forEach((unwatch) => unwatch());
      unlisten();
      clearTimeout(pending);
    };
  }, [listens, eventId, whats]);
};
