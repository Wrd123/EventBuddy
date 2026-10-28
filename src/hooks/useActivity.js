import { useCallback, useEffect, useRef, useState } from 'react';
import * as eventService from '../services/eventService';
import { usePolling } from './usePolling';
import { EVENT_POLL_MS } from './useEvent';
import { createFreshness } from '../utils/freshness';
import { emptyFeed, clearFeed, mergeNewest, appendOlder } from '../utils/activity';

const OLDER_FAILED = "Couldn't load earlier activity. Try again.";

// An event's recent activity (see utils/activity.js): the newest page, read
// again whenever anything in the event changes, and older pages on request.
//
// status: 'loading' | 'ready' | 'error' (the first read failed) | 'gone'.
// As everywhere in the app, a read that fails later keeps what's shown: the
// phone is probably just offline. A 404 is different. The event was deleted
// or you were taken out of it, so the lines go, and nothing that was already
// on its way (a slow read, an older page) can bring them back.
export const useActivity = (eventId) => {
  const [state, setState] = useState({ eventId, status: 'loading', feed: emptyFeed });
  const [older, setOlder] = useState({ eventId, loading: false, error: '' });
  const [freshness] = useState(createFreshness);
  // An answer for an event the screen has since moved on from doesn't count
  const shown = useRef(eventId);
  shown.current = eventId;

  const lose = useCallback(() => {
    // Reads that were out when access went don't count
    freshness.changed();
    setState((prev) => ({ eventId, status: 'gone', feed: clearFeed(prev.feed) }));
  }, [eventId, freshness]);

  const load = useCallback(async () => {
    const read = freshness.start();
    try {
      const page = await eventService.getActivity(eventId);
      if (shown.current !== eventId || !freshness.accept(read)) return;
      setState((prev) => ({
        eventId,
        status: 'ready',
        feed: mergeNewest(prev.eventId === eventId ? prev.feed : clearFeed(prev.feed), page)
      }));
    } catch (err) {
      if (shown.current !== eventId) return;
      if (err.status === 404) {
        if (freshness.accept(read)) lose();
        return;
      }
      setState((prev) => (prev.eventId === eventId && prev.status !== 'loading'
        ? prev
        : { eventId, status: 'error', feed: clearFeed(prev.feed) }));
    }
  }, [eventId, freshness, lose]);

  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, EVENT_POLL_MS, { eventId, what: 'event' });

  const current = state.eventId === eventId ? state : { status: 'loading', feed: emptyFeed };
  const olderNow = older.eventId === eventId ? older : { loading: false, error: '' };

  const loadOlder = async () => {
    const { gen, items } = current.feed;
    if (olderNow.loading || items.length === 0) return;
    setOlder({ eventId, loading: true, error: '' });
    try {
      const page = await eventService.getActivity(eventId, { before: items.at(-1)._id });
      if (shown.current !== eventId) return;
      setState((prev) => (prev.eventId === eventId ? { ...prev, feed: appendOlder(prev.feed, page, gen) } : prev));
      setOlder({ eventId, loading: false, error: '' });
    } catch (err) {
      if (shown.current !== eventId) return;
      if (err.status === 404) lose();
      setOlder({ eventId, loading: false, error: err.status === 404 ? '' : OLDER_FAILED });
    }
  };

  return {
    status: current.status,
    items: current.feed.items,
    hasMore: current.feed.hasMore,
    loadingOlder: olderNow.loading,
    olderError: olderNow.error,
    loadOlder,
    // For a pull to refresh; a failed read already keeps quiet
    refresh: load
  };
};
