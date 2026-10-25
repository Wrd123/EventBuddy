import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as liveService from '../services/liveService';
import { startTracking } from '../services/locationTracker';
import { shouldSend } from '../utils/live';

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

// Follows the phone's position while sharing and sends it to the event
// (after moving a bit, or every couple of minutes). Stops by itself when
// the time is up. onEnded: sharing ran out or the server says it's over.
const useShareMyLocation = (share, onEnded) => {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState('');
  const lastSent = useRef(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const eventId = share?.eventId;
  const until = share?.until;

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
    lastSent.current = null;
    const stop = startTracking({
      onPosition: (next) => {
        if (!active) return;
        setPosition(next);
        setError('');
        if (!shouldSend(next, lastSent.current)) return;
        lastSent.current = { ...next, at: Date.now() };
        liveService.sendPosition(eventId, next).catch(err => {
          // 409: sharing already ended (on another device, or time ran out).
          // 404: you're no longer in the event (you left or were removed).
          if ((err.status === 409 || err.status === 404) && active) onEndedRef.current();
          else lastSent.current = null; // offline: send the next one
        });
      },
      onError: (message) => active && setError(message)
    });
    const timer = setTimeout(() => onEndedRef.current(), remaining);

    return () => {
      active = false;
      stop();
      clearTimeout(timer);
    };
  }, [eventId, until]);

  return { position, error };
};

// isAuthenticated / isLoading come from AppContext; when a session ends
// (log out, or an expired login) this device stops sharing
export const SharingProvider = ({ isAuthenticated, isLoading, children }) => {
  const [share, setShareState] = useState(() => readStored(SHARE_KEY));
  // { eventId, until }: a share the server may still be showing friends,
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
