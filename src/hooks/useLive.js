import { useState, useEffect, useCallback, useRef } from 'react';
import * as liveService from '../services/liveService';
import { usePolling } from './usePolling';
import { useSharing, endShareOnServer } from '../context/SharingContext';
import { ApiError } from '../services/api';
import { createFreshness } from '../utils/freshness';

// Friends' positions arrive about this often while the map is open
export const LIVE_POLL_MS = 10000;

// Who's sharing where in an event, and the meetup point, kept fresh while
// the map is on screen. eventId may be null (no event happening).
// status: 'idle' | 'loading' | 'ready' | 'error'
export const useLive = (eventId) => {
  const [state, setState] = useState({ status: eventId ? 'loading' : 'idle', sharing: null, people: [], meetup: null, error: '' });
  const current = useRef(eventId);
  current.current = eventId;
  // The app-wide share (see SharingContext) follows what the server says
  const { share, setShare, unstopped, setUnstopped } = useSharing();
  const shareRef = useRef(share);
  shareRef.current = share;
  // A share you asked to stop that the server still has (see SharingContext).
  // Stopping is what you wanted, so the server's copy is never taken up again.
  const unstoppedRef = useRef(unstopped);
  unstoppedRef.current = unstopped;
  const retryingStop = useRef(false);
  // A read sent before a stop (or any change made here) still has the old
  // state, and would turn sharing back on if it landed after it
  const [freshness] = useState(createFreshness);

  // Tries that stop again in the background, once per refresh. The warning
  // stays until it gets through.
  const retryStop = useCallback(async () => {
    if (retryingStop.current) return;
    retryingStop.current = true;
    try {
      await endShareOnServer(eventId);
      freshness.changed();
      if (unstoppedRef.current?.eventId === eventId) setUnstopped(null);
      if (current.current === eventId) setState(prev => ({ ...prev, sharing: null }));
    } catch {
      // Still unreachable: the next refresh tries again
    } finally {
      retryingStop.current = false;
    }
  }, [eventId, setUnstopped, freshness]);

  const load = useCallback(async () => {
    if (!eventId) return;
    const read = freshness.start();
    try {
      const { sharing, people, meetup } = await liveService.getLive(eventId);
      if (current.current !== eventId || !freshness.accept(read)) return;
      setState({ status: 'ready', sharing, people, meetup, error: '' });
      const mine = shareRef.current;
      if (unstoppedRef.current?.eventId === eventId) {
        if (sharing) retryStop();
        // Ended some other way (time up, stopped elsewhere), so nothing to warn about
        else setUnstopped(null);
        return;
      }
      // Started on another device, or ended (stopped elsewhere, time up)
      if (sharing && (mine?.eventId !== eventId || mine.until !== sharing.until)) {
        setShare({ eventId, until: sharing.until });
      } else if (!sharing && mine?.eventId === eventId) {
        setShare(null);
      }
    } catch (err) {
      // Keep showing the last positions if a refresh fails
      if (current.current === eventId) {
        setState(prev => (prev.status === 'ready' ? prev : { ...prev, status: 'error', error: err.message }));
      }
    }
  }, [eventId, setShare, setUnstopped, retryStop, freshness]);

  useEffect(() => {
    setState({ status: eventId ? 'loading' : 'idle', sharing: null, people: [], meetup: null, error: '' });
    load();
  }, [eventId, load]);
  usePolling(load, LIVE_POLL_MS);

  // One event at a time: starting here ends sharing with any other event.
  // If that can't be confirmed, nothing changes: otherwise friends at the
  // other event would still see you there while this phone stopped sending.
  const startSharing = useCallback(async (until) => {
    const previous = shareRef.current;
    if (previous && previous.eventId !== eventId) {
      try {
        await endShareOnServer(previous.eventId);
      } catch (err) {
        throw new ApiError(err.status, "Couldn't stop sharing with your other event first. Try again.");
      }
    }
    const sharing = await liveService.startSharing(eventId, until);
    freshness.changed();
    setState(prev => ({ ...prev, sharing }));
    setShare({ eventId, until: new Date(sharing.until).toISOString() });
  }, [eventId, setShare, freshness]);

  const stopSharing = useCallback(async () => {
    await endShareOnServer(eventId);
    freshness.changed();
    setState(prev => ({ ...prev, sharing: null }));
    if (shareRef.current?.eventId === eventId) setShare(null);
    if (unstoppedRef.current?.eventId === eventId) setUnstopped(null);
  }, [eventId, setShare, setUnstopped, freshness]);

  const setMeetup = useCallback(async (meetup) => {
    const saved = await liveService.setMeetup(eventId, meetup);
    freshness.changed();
    setState(prev => ({ ...prev, meetup: saved }));
  }, [eventId, freshness]);

  const clearMeetup = useCallback(async () => {
    await liveService.clearMeetup(eventId);
    freshness.changed();
    setState(prev => ({ ...prev, meetup: null }));
  }, [eventId, freshness]);

  // This phone stopped, but friends may still see its last spot here
  const stopPending = Boolean(state.sharing) && unstopped?.eventId === eventId;

  return { ...state, stopPending, reload: load, startSharing, stopSharing, setMeetup, clearMeetup };
};
