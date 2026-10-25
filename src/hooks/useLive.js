import { useState, useEffect, useCallback, useRef } from 'react';
import * as liveService from '../services/liveService';
import { usePolling } from './usePolling';
import { useSharing } from '../context/SharingContext';

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
  const { share, setShare } = useSharing();
  const shareRef = useRef(share);
  shareRef.current = share;

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const { sharing, people, meetup } = await liveService.getLive(eventId);
      if (current.current !== eventId) return;
      setState({ status: 'ready', sharing, people, meetup, error: '' });
      // Started on another device, or ended (stopped elsewhere, time up)
      const mine = shareRef.current;
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
  }, [eventId, setShare]);

  useEffect(() => {
    setState({ status: eventId ? 'loading' : 'idle', sharing: null, people: [], meetup: null, error: '' });
    load();
  }, [eventId, load]);
  usePolling(load, LIVE_POLL_MS);

  // One event at a time: starting here ends sharing with any other event
  const startSharing = useCallback(async (until) => {
    const previous = shareRef.current;
    if (previous && previous.eventId !== eventId) await liveService.stopSharing(previous.eventId).catch(() => {});
    const sharing = await liveService.startSharing(eventId, until);
    setState(prev => ({ ...prev, sharing }));
    setShare({ eventId, until: new Date(sharing.until).toISOString() });
  }, [eventId, setShare]);

  const stopSharing = useCallback(async () => {
    await liveService.stopSharing(eventId);
    setState(prev => ({ ...prev, sharing: null }));
    if (shareRef.current?.eventId === eventId) setShare(null);
  }, [eventId, setShare]);

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
