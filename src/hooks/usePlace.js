import { useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import * as discoverService from '../services/discoverService';

// Plain-language reasons the phone couldn't share its location
const LOCATION_ERRORS = {
  1: 'Location is turned off for EventBuddy. Enter a city or ZIP code instead.',
  2: "Couldn't find your location. Enter a city or ZIP code instead.",
  3: 'Finding your location took too long. Try again, or enter a city or ZIP code.'
};

const currentPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error("This device can't share its location. Enter a city or ZIP code instead."), { code: 0 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false, // city-level is all we need, and it's faster
      timeout: 10000,
      maximumAge: 10 * 60 * 1000
    });
  });

// The place Discover and Home search around, shared through AppContext so
// both screens agree. place: { label, lat, lng, source: 'device' | 'search' }
export const usePlace = () => {
  const { place, savePlace } = useAppContext();
  const [status, setStatus] = useState({ busy: false, error: '' });

  const run = useCallback(async (lookup) => {
    setStatus({ busy: true, error: '' });
    try {
      savePlace(await lookup());
      setStatus({ busy: false, error: '' });
      return true;
    } catch (err) {
      setStatus({ busy: false, error: LOCATION_ERRORS[err.code] || err.message });
      return false;
    }
  }, [savePlace]);

  const locateDevice = useCallback(() => run(async () => {
    const { coords } = await currentPosition();
    const found = await discoverService.getPlaceAt(coords.latitude, coords.longitude);
    return { ...found, source: 'device' };
  }), [run]);

  const searchPlace = useCallback((text) => run(async () => {
    const found = await discoverService.findPlace(text.trim());
    return { ...found, source: 'search' };
  }), [run]);

  return { place, busy: status.busy, error: status.error, locateDevice, searchPlace };
};
