import { useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import * as discoverService from '../services/discoverService';
import { findDevicePlace } from '../services/devicePlace';

// The place Discover and Home search around, shared through AppContext so
// both screens agree. place: { label, lat, lng, source: 'device' | 'search' }.
// locationError: why the phone's location isn't available, if it isn't.
export const usePlace = () => {
  const { place, savePlace, locationError } = useAppContext();
  const [status, setStatus] = useState({ busy: false, error: '' });

  const run = useCallback(async (lookup) => {
    setStatus({ busy: true, error: '' });
    try {
      savePlace(await lookup());
      setStatus({ busy: false, error: '' });
      return true;
    } catch (err) {
      setStatus({ busy: false, error: err.message });
      return false;
    }
  }, [savePlace]);

  const locateDevice = useCallback(() => run(findDevicePlace), [run]);

  const searchPlace = useCallback((text) => run(async () => {
    const found = await discoverService.findPlace(text.trim());
    return { ...found, source: 'search' };
  }), [run]);

  return { place, locationError, busy: status.busy, error: status.error, locateDevice, searchPlace };
};
