import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { usePolling } from './usePolling';

// An open event is checked this often for changes friends made
export const EVENT_POLL_MS = 15000;

// Look up an event by the id in the URL.
// status: 'loading' | 'ready' | 'not-found' | 'error' (with an error message)
//
// Shows the already-loaded copy straight away when there is one, then asks
// the server for a fresh one on opening and every so often while the screen
// is up, so a friend's new schedule item or a deleted event shows without
// a refresh. The fresh copy goes into the shared events list (fetchEvent),
// so every screen sees the same event.
//
// refresh() is the same check for a pull to refresh: it resolves when the
// event is current and rejects if the server couldn't be reached. Either
// way the copy on screen stays.
export const useEvent = (eventId) => {
  const { events, fetchEvent } = useAppContext();
  const cached = events.find(event => event._id === eventId);
  const [checked, setChecked] = useState({ eventId: null, status: 'loading', error: '' });

  // -> the result that was kept, or null if every try was overtaken
  const check = useCallback(async () => {
    // null: overtaken by another read (on launch, the events list loads at
    // the same time). Ask again rather than leave a link to a deleted event
    // spinning until the next check.
    for (let tries = 0; tries < 3; tries += 1) {
      const result = await fetchEvent(eventId);
      if (result) {
        setChecked({ eventId, ...result });
        return result;
      }
    }
    return null;
  }, [eventId, fetchEvent]);

  const refresh = useCallback(async () => {
    const result = await check();
    if (result?.status === 'error') throw new Error(result.error);
  }, [check]);

  useEffect(() => {
    check();
  }, [check]);
  usePolling(() => { check(); }, EVENT_POLL_MS);

  // A result for a previous id doesn't count
  const latest = checked.eventId === eventId ? checked : null;
  if (latest?.status === 'not-found') return { event: null, status: 'not-found', error: latest.error, refresh };
  // Offline with a copy in hand: keep showing it
  if (cached) return { event: cached, status: 'ready', error: '', refresh };
  if (latest?.status === 'error') return { event: null, status: 'error', error: latest.error, refresh };
  return { event: null, status: 'loading', error: '', refresh };
};
