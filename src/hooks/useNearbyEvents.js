import { useState, useEffect, useCallback } from 'react';
import * as discoverService from '../services/discoverService';

// Upcoming events around `place` ({ lat, lng }), or only those starting
// from/to ("YYYY-MM-DD", e.g. during a trip). status: 'idle' (no place yet)
// | 'loading' | 'ready' | 'error'. reload() retries after an error.
export const useNearbyEvents = (place, { radius = 25, category = 'all', from, to } = {}) => {
  const [state, setState] = useState({ status: 'idle', events: [], error: '' });
  const [attempt, setAttempt] = useState(0);
  const lat = place?.lat;
  const lng = place?.lng;

  useEffect(() => {
    if (lat === undefined || lng === undefined) {
      setState({ status: 'idle', events: [], error: '' });
      return undefined;
    }

    // Ignore a slow response for a search the user has already changed
    let cancelled = false;
    setState(prev => ({ ...prev, status: 'loading', error: '' }));
    discoverService.getNearbyEvents({ lat, lng, radius, category, from, to })
      .then(events => !cancelled && setState({ status: 'ready', events, error: '' }))
      .catch(err => !cancelled && setState({ status: 'error', events: [], error: err.message }));
    return () => { cancelled = true; };
  }, [lat, lng, radius, category, from, to, attempt]);

  const reload = useCallback(() => setAttempt(n => n + 1), []);
  return { ...state, reload };
};
