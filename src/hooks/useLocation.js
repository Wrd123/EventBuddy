import { useState, useCallback } from 'react';
import { locationService } from '../services/locationService';

export const useLocation = () => {
  const [nearbyEvents, setNearbyEvents] = useState([]);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [hasLocation, setHasLocation] = useState(false);

  const requestLocation = useCallback(async () => {
    setIsLoadingLocation(true);
    try {
      await locationService.getCurrentLocation();
      setHasLocation(true);
      
      setIsLoadingEvents(true);
      const events = await locationService.getEventsNearLocation();
      setNearbyEvents(events);
      setIsLoadingEvents(false);
    } catch (error) {
      console.error('Location error:', error);
    } finally {
      setIsLoadingLocation(false);
    }
  }, []);

  const getLocationString = () => "Atlanta, GA";

  return {
    nearbyEvents,
    isLoadingLocation,
    isLoadingEvents,
    hasLocation,
    requestLocation,
    getLocationString,
    isLocationAvailable: !!navigator.geolocation
  };
};
