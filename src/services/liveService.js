// Finding each other during an event: shared locations and the meetup point
import { apiRequest } from './api';

const livePath = (eventId) => `/events/${encodeURIComponent(eventId)}/live`;

// -> { sharing: { until } | null, people: [{ user, name, color, lat, lng,
//      accuracy, positionAt, until }], meetup: { lat, lng, note, time,
//      setBy: { user, name }, setAt } | null }
export const getLive = (eventId) => apiRequest(livePath(eventId));

// until: a Date, at most 24 hours ahead
export const startSharing = async (eventId, until) =>
  (await apiRequest(`${livePath(eventId)}/share`, { method: 'PUT', body: { until: until.toISOString() } })).sharing;

export const stopSharing = (eventId) => apiRequest(`${livePath(eventId)}/share`, { method: 'DELETE' });

export const sendPosition = (eventId, { lat, lng, accuracy }) =>
  apiRequest(`${livePath(eventId)}/position`, { method: 'PUT', body: { lat, lng, accuracy } });

export const setMeetup = async (eventId, meetup) =>
  (await apiRequest(`${livePath(eventId)}/meetup`, { method: 'PUT', body: meetup })).meetup;

export const clearMeetup = (eventId) => apiRequest(`${livePath(eventId)}/meetup`, { method: 'DELETE' });
