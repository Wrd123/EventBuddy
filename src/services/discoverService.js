// Local events and place lookups for Discover, via the EventBuddy API
// (which talks to Ticketmaster and OpenStreetMap so their keys and rules
// stay on the server).
import { apiRequest } from './api';

// About 1 km: enough for "events within 25 miles", too coarse to pinpoint
// anyone. Precise coordinates never leave the phone.
export const roundCoordinate = (n) => Math.round(n * 100) / 100;

const query = (params) => new URLSearchParams(params).toString();

// -> { label: 'Atlanta, GA', lat, lng }
export const getPlaceAt = async (lat, lng) => {
  const { place } = await apiRequest(`/discover/place?${query({ lat: roundCoordinate(lat), lng: roundCoordinate(lng) })}`);
  return place;
};

// A city or ZIP code -> place (throws a 404 ApiError if not found)
export const findPlace = async (text) => {
  const { place } = await apiRequest(`/discover/place?${query({ q: text })}`);
  return place;
};

// -> [{ _id, name, type, startDate, endDate, startTime, venue, location, distanceMiles, ticketUrl }]
export const getNearbyEvents = async ({ lat, lng, radius = 25, category = 'all' }) => {
  const { events } = await apiRequest(
    `/discover/events?${query({ lat: roundCoordinate(lat), lng: roundCoordinate(lng), radius, category })}`
  );
  return events;
};
