// Finding each other during an event: shared locations and the meetup point
import { apiRequest } from './api';

const livePath = (eventId) => `/events/${encodeURIComponent(eventId)}/live`;

// -> { sharing: { id, until } | null, people: [{ user, name, color, share,
//      lat, lng, accuracy, positionAt, until }], meetup: { lat, lng, note, time,
//      setBy: { user, name }, setAt } | null }
export const getLive = (eventId) => apiRequest(livePath(eventId));

// until: a Date, at most 24 hours ahead
export const startSharing = async (eventId, until) =>
  (await apiRequest(`${livePath(eventId)}/share`, { method: 'PUT', body: { until: until.toISOString() } })).sharing;

export const stopSharing = (eventId) => apiRequest(`${livePath(eventId)}/share`, { method: 'DELETE' });

// fix: { lat, lng, accuracy, measuredAt }. order: { shareId, seq }, which
// lets the server drop a fix that arrives after a newer one, or from a share
// that has ended. Without it (a share that has no id yet) the old body goes.
// ageMs is worked out now, from the phone's own clock, so it stays right
// even when the phone's time of day is wrong.
export const sendPosition = (eventId, { lat, lng, accuracy, measuredAt }, order) => {
  const body = { lat, lng, accuracy };
  if (order) {
    body.shareId = order.shareId;
    body.seq = order.seq;
    body.ageMs = Math.max(0, Date.now() - (measuredAt ?? Date.now()));
  }
  return apiRequest(`${livePath(eventId)}/position`, { method: 'PUT', body });
};

export const setMeetup = async (eventId, meetup) =>
  (await apiRequest(`${livePath(eventId)}/meetup`, { method: 'PUT', body: meetup })).meetup;

export const clearMeetup = (eventId) => apiRequest(`${livePath(eventId)}/meetup`, { method: 'DELETE' });
