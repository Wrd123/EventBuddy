import { useState, useEffect, useCallback } from 'react';
import * as mapService from '../services/mapService';

// Your events with their map positions.
// status: 'loading' | 'ready' | 'error'
export const useMapEvents = () => {
  const [state, setState] = useState({ status: 'loading', events: [], error: '' });

  const load = useCallback(async () => {
    setState(prev => ({ ...prev, status: 'loading' }));
    try {
      setState({ status: 'ready', events: await mapService.getMapEvents(), error: '' });
    } catch (err) {
      setState({ status: 'error', events: [], error: err.message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
};
