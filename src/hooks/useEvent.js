import { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import * as eventService from '../services/eventService';

// Look up an event by the id in the URL.
// status: 'loading' | 'ready' | 'not-found'
//
// Uses the already-loaded events list when it has the event (instant), and
// otherwise fetches it, e.g. on a refresh or a link straight to /events/:id
// before the list has loaded.
export const useEvent = (eventId) => {
  const { events } = useAppContext();
  const cached = events.find(event => event._id === eventId);
  const [fetched, setFetched] = useState({ eventId: null, event: null, status: 'loading' });

  useEffect(() => {
    if (cached) return;

    // Ignore a response that arrives after the id changed or the screen closed
    let cancelled = false;
    eventService.getEventById(eventId)
      .then(event => !cancelled && setFetched({ eventId, event, status: 'ready' }))
      .catch(() => !cancelled && setFetched({ eventId, event: null, status: 'not-found' }));

    return () => { cancelled = true; };
  }, [eventId, cached]);

  if (cached) return { event: cached, status: 'ready' };
  // A result for a previous id doesn't count
  if (fetched.eventId !== eventId) return { event: null, status: 'loading' };
  return { event: fetched.event, status: fetched.status };
};
