import { useState, useEffect, useCallback, useRef } from 'react';
import * as liveService from '../services/liveService';
import { startTracking } from '../services/locationTracker';
import { usePolling } from './useChat';
import { shouldSend } from '../utils/live';

// Friends' positions arrive about this often while the map is open
export const LIVE_POLL_MS = 10000;

// Who's sharing where in an event, and the meetup point, kept fresh while
// the map is on screen. eventId may be null (no event happening).
// status: 'idle' | 'loading' | 'ready' | 'error'
export const useLive = (eventId) => {
  const [state, setState] = useState({ status: eventId ? 'loading' : 'idle', sharing: null, people: [], meetup: null, error: '' });
  const current = useRef(eventId);
  current.current = eventId;

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const { sharing, people, meetup } = await liveService.getLive(eventId);
      if (current.current === eventId) setState({ status: 'ready', sharing, people, meetup, error: '' });
    } catch (err) {
      // Keep showing the last positions if a refresh fails
      if (current.current === eventId) {
        setState(prev => (prev.status === 'ready' ? prev : { ...prev, status: 'error', error: err.message }));
      }
    }
  }, [eventId]);

  useEffect(() => {
    setState({ status: eventId ? 'loading' : 'idle', sharing: null, people: [], meetup: null, error: '' });
    load();
  }, [eventId, load]);
  usePolling(load, LIVE_POLL_MS);

  const startSharing = useCallback(async (until) => {
    const sharing = await liveService.startSharing(eventId, until);
    setState(prev => ({ ...prev, sharing }));
  }, [eventId]);

  const stopSharing = useCallback(async () => {
    await liveService.stopSharing(eventId);
    setState(prev => ({ ...prev, sharing: null }));
  }, [eventId]);

  const setMeetup = useCallback(async (meetup) => {
    const saved = await liveService.setMeetup(eventId, meetup);
    setState(prev => ({ ...prev, meetup: saved }));
  }, [eventId]);

  const clearMeetup = useCallback(async () => {
    await liveService.clearMeetup(eventId);
    setState(prev => ({ ...prev, meetup: null }));
  }, [eventId]);

  return { ...state, reload: load, startSharing, stopSharing, setMeetup, clearMeetup };
};

// While you're sharing, follows the phone's position and sends it to the
// event (after moving a bit, or every couple of minutes). Stops by itself
// when sharing ends. -> { position (yours, for the map), error }
// onEnded: sharing ran out or the server says it's over
export const useShareMyLocation = (eventId, sharing, onEnded) => {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState('');
  const lastSent = useRef(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const until = sharing?.until;

  useEffect(() => {
    if (!eventId || !until) {
      // Not tracking, so nothing to report either
      setPosition(null);
      setError('');
      return undefined;
    }
    const remaining = new Date(until).getTime() - Date.now();
    if (remaining <= 0) {
      onEndedRef.current?.();
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
          if (err.status === 409 && active) onEndedRef.current?.();
          else lastSent.current = null; // offline: send the next one
        });
      },
      onError: (message) => active && setError(message)
    });
    const timer = setTimeout(() => onEndedRef.current?.(), remaining);

    return () => {
      active = false;
      stop();
      clearTimeout(timer);
    };
  }, [eventId, until]);

  return { position, error };
};
