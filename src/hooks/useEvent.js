import { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import * as eventService from '../services/eventService';

// Look up an event by the id in the URL.
// status: 'loading' | 'ready' | 'not-found' | 'error' (with an error message)
//
// Uses the already-loaded events list when it has the event (instant), and
// otherwise fetches it, e.g. on a refresh or a link straight to /events/:id
// before the list has loaded.
export const useEvent = (eventId) => {
  const { events } = useAppContext();
  const cached = events.find(event => event._id === eventId);
  const [fetched, setFetched] = useState({ eventId: null, event: null, status: 'loading', error: '' });

  useEffect(() => {
    if (cached) return;

    // Ignore a response that arrives after the id changed or the screen closed
    let cancelled = false;
    eventService.getEventById(eventId)
      .then(event => !cancelled && setFetched({ eventId, event, status: 'ready', error: '' }))
      .catch(err => {
        if (cancelled) return;
        // 404: no such event (or not yours). Anything else: offline, server down...
        const status = err.status === 404 ? 'not-found' : 'error';
        setFetched({ eventId, event: null, status, error: err.message });
      });

    return () => { cancelled = true; };
  }, [eventId, cached]);

  if (cached) return { event: cached, status: 'ready', error: '' };
  // A result for a previous id doesn't count
  if (fetched.eventId !== eventId) return { event: null, status: 'loading', error: '' };
  return fetched;
};
