import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as liveService from '../services/liveService';
import { startTracking } from '../services/locationTracker';
import { nextSend, backoffMs } from '../utils/live';

// Sharing your location with an event, for the whole app rather than one
// screen: once you start, your position keeps going to the event whatever
// screen you're on (and, in the phone app, with the screen locked) until
// the time runs out, you stop, or you log out. One event at a time.
//
// The share is remembered on the device, so reopening the app picks it
// back up.
const SHARE_KEY = 'eventbuddy_share';
// A share this phone stopped tracking but couldn't end on the server (see
// unstopped below), kept until the server confirms or it runs out
const UNSTOPPED_KEY = 'eventbuddy_unstopped_share';
// The last fix number sent for a share. Kept on the device, because the
// server drops a fix numbered no higher than the last it stored: a count
// that restarted at 1 after a relaunch would freeze your pin for friends.
const SEQ_KEY = 'eventbuddy_share_seq';

const readSeq = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(SEQ_KEY));
    if (stored && typeof stored.shareId === 'string' && Number.isSafeInteger(stored.last)) return stored;
  } catch {
    // Unreadable: start again, and the server's own count catches it up
  }
  return { shareId: null, last: 0 };
};

const writeSeq = (seq) => {
  try {
    localStorage.setItem(SEQ_KEY, JSON.stringify(seq));
  } catch {
    // Not remembered across launches; the server's count still helps
  }
};

const readStored = (key) => {
  try {
    const share = JSON.parse(localStorage.getItem(key));
    return share && new Date(share.until) > new Date() ? share : null;
  } catch {
    return null;
  }
};

const writeStored = (key, share) => {
  try {
    if (share) localStorage.setItem(key, JSON.stringify(share));
    else localStorage.removeItem(key);
  } catch {
    // Not remembered across launches, but sharing still works now
  }
};

// Ends a share on the server. A 404 means it's over already (the event was
// deleted, or you're no longer in it), which is what we wanted. Anything
// else is thrown, so the person hears that friends can still see them.
export const endShareOnServer = async (eventId) => {
  try {
    await liveService.stopSharing(eventId);
  } catch (err) {
    if (err.status !== 404) throw err;
  }
};

const SharingContext = createContext({
  share: null, position: null, error: '', setShare: () => {}, unstopped: null, setUnstopped: () => {}
});

export const useSharing = () => useContext(SharingContext);

// Follows the phone's position while sharing and sends it to the event:
// about every 2 s while moving, and a slow heartbeat while still (see
// nextSend). Stops by itself when the time is up. onEnded: sharing ran out
// or the server says it's over.
//
// share: { eventId, until, id }. id is the server's name for this share,
// which orders the uploads; a share stored before ids existed has none and
// sends the older way until a read of the event fills it in.
const useShareMyLocation = (share, onEnded) => {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState('');
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const eventId = share?.eventId;
  const until = share?.until;
  const shareId = share?.id;
  const shareIdRef = useRef(shareId);
  shareIdRef.current = shareId;
  // The last fix number the server told us it stored for this share
  const serverSeqRef = useRef(share?.seq);
  serverSeqRef.current = share?.seq;
  // The last number used for the share. It lives outside the effect, and on
  // the device, so extending a share (which restarts tracking) and
  // relaunching the app both keep counting up.
  const seq = useRef(null);
  if (!seq.current) seq.current = readSeq();

  useEffect(() => {
    if (!eventId || !until) {
      // Not tracking, so nothing to report either
      setPosition(null);
      setError('');
      return undefined;
    }
    const remaining = new Date(until).getTime() - Date.now();
    if (remaining <= 0) {
      onEndedRef.current();
      return undefined;
    }

    let active = true;
    setError('');
    // Only the newest fix waits its turn: an older one is no use to friends
    let pending = null;
    let inFlight = false;
    // The last upload that worked, to pace the next one against
    let lastSent = null;
    let failures = 0;
    // No upload before this time, after a failure
    let retryAt = 0;
    let timer = null;

    // Above both our own count and the server's, which is ahead when this
    // device lost count or another one sent for the same share
    const nextSeq = (id) => {
      const mine = seq.current.shareId === id ? seq.current.last : 0;
      seq.current = { shareId: id, last: Math.max(mine, serverSeqRef.current || 0) + 1 };
      writeSeq(seq.current);
      return seq.current.last;
    };

    // Sends the pending fix if the rules say it's time. Called whenever
    // something could make it so: a fix, an upload ending, the app coming
    // back to the screen. The timer is only a backstop for a send that is
    // due later: a locked phone can pause JavaScript timers, but the native
    // location callbacks keep coming and call this too.
    const trySend = () => {
      clearTimeout(timer);
      if (!active || inFlight || !pending) return;
      const now = Date.now();
      let dueAt = retryAt;
      if (now >= retryAt) {
        const next = nextSend({ fix: pending, lastSent, now, hidden: document.visibilityState === 'hidden' });
        if (next.send) {
          send(now);
          return;
        }
        dueAt = next.dueAt;
      }
      if (dueAt) timer = setTimeout(trySend, Math.max(0, dueAt - now));
    };

    const send = (startedAt) => {
      const fix = pending;
      pending = null;
      inFlight = true;
      const id = shareIdRef.current;
      const order = id ? { shareId: id, seq: nextSeq(id) } : undefined;
      liveService.sendPosition(eventId, fix, order).then(
        () => {
          if (!active) return;
          inFlight = false;
          failures = 0;
          lastSent = { ...fix, at: startedAt };
          trySend();
        },
        (err) => {
          if (!active) return;
          inFlight = false;
          // 409: sharing already ended (on another device, or time ran out).
          // 404: you're no longer in the event (you left or were removed).
          if (err.status === 409 || err.status === 404) {
            onEndedRef.current();
            return;
          }
          // Any other failure waits before the next try, so nothing can
          // turn into a request on every location update
          failures += 1;
          retryAt = Date.now() + backoffMs(failures, err.retryAfterSeconds);
          // Offline, the server struggling or too busy: send the newest fix
          // after the wait, which is this one if nothing newer has come.
          // Other refusals (a fix the server finds invalid) would fail the
          // same way every time, so that fix is dropped.
          const retriable = err.status === 0 || err.status >= 500 || err.status === 429;
          if (retriable && !pending) pending = fix;
          trySend();
        }
      );
    };

    const stop = startTracking({
      onPosition: (next) => {
        if (!active) return;
        setPosition(next);
        setError('');
        pending = next;
        trySend();
      },
      onError: (message) => active && setError(message)
    });
    const onVisibility = () => {
      if (document.visibilityState === 'visible') trySend();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const endTimer = setTimeout(() => onEndedRef.current(), remaining);

    return () => {
      active = false;
      pending = null;
      stop();
      clearTimeout(endTimer);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [eventId, until]);

  return { position, error };
};

// isAuthenticated / isLoading come from AppContext; when a session ends
// (log out, or an expired login) this device stops sharing
export const SharingProvider = ({ isAuthenticated, isLoading, children }) => {
  const [share, setShareState] = useState(() => readStored(SHARE_KEY));
  // { eventId, until, id }: a share the server may still be showing friends,
  // after this phone stopped tracking (logging out while offline). Kept
  // here and on the device, not on one screen, so the warning survives
  // leaving that screen or reopening the app.
  const [unstopped, setUnstoppedState] = useState(() => readStored(UNSTOPPED_KEY));

  const setShare = useCallback((next) => {
    setShareState(next);
    writeStored(SHARE_KEY, next);
  }, []);

  const setUnstopped = useCallback((next) => {
    setUnstoppedState(next);
    writeStored(UNSTOPPED_KEY, next);
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setShare(null);
      setUnstopped(null);
    }
  }, [isAuthenticated, isLoading, setShare, setUnstopped]);

  const ended = useCallback(() => setShare(null), [setShare]);
  const { position, error } = useShareMyLocation(share, ended);

  return (
    <SharingContext.Provider value={{ share, position, error, setShare, unstopped, setUnstopped }}>
      {children}
    </SharingContext.Provider>
  );
};
