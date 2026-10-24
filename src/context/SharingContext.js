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

const readStoredShare = () => {
  try {
    const share = JSON.parse(localStorage.getItem(SHARE_KEY));
    return share && new Date(share.until) > new Date() ? share : null;
  } catch {
    return null;
  }
};

const writeStoredShare = (share) => {
  try {
    if (share) localStorage.setItem(SHARE_KEY, JSON.stringify(share));
    else localStorage.removeItem(SHARE_KEY);
  } catch {
    // Not remembered across launches, but sharing still works now
  }
};

// Ends the remembered share on the server too. For logging out: called
// before the login token is cleared, since the request needs it.
export const stopStoredShare = () => {
  const share = readStoredShare();
  writeStoredShare(null);
  if (share) liveService.stopSharing(share.eventId).catch(() => {});
};

const SharingContext = createContext({ share: null, position: null, error: '', setShare: () => {} });

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
          // 409: sharing already ended (on another device, or time ran out)
          if (err.status === 409 && active) onEndedRef.current();
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
  const [share, setShareState] = useState(readStoredShare);

  const setShare = useCallback((next) => {
    setShareState(next);
    writeStoredShare(next);
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) setShare(null);
  }, [isAuthenticated, isLoading, setShare]);

  const ended = useCallback(() => setShare(null), [setShare]);
  const { position, error } = useShareMyLocation(share, ended);

  return (
    <SharingContext.Provider value={{ share, position, error, setShare }}>
      {children}
    </SharingContext.Provider>
  );
};
