// Events from the EventBuddy API
import { suggestedEvents as mockSuggestedEvents } from '../data/mockData';
import { apiRequest } from './api';

const eventPath = (eventId) => `/events/${encodeURIComponent(eventId)}`;

export const getUserEvents = async () => {
  const { events } = await apiRequest('/events');
  return events;
};

// Discovery has no backend yet, so suggestions are still mock data
export const getSuggestedEvents = async () => [...mockSuggestedEvents];

export const getEventById = async (eventId) => {
  const { event } = await apiRequest(eventPath(eventId));
  return event;
};

// Returns { event }. The server adds the logged-in user as organizer and
// first member, and validates the fields.
export const createEvent = (eventData) =>
  apiRequest('/events', { method: 'POST', body: eventData });

export const updateEvent = (eventId, eventData) =>
  apiRequest(eventPath(eventId), { method: 'PATCH', body: eventData });

export const deleteEvent = (eventId) =>
  apiRequest(eventPath(eventId), { method: 'DELETE' });

// Schedule items. Each call returns the whole updated event.
const schedulePath = (eventId, itemId) =>
  `${eventPath(eventId)}/schedule${itemId ? `/${encodeURIComponent(itemId)}` : ''}`;

export const addScheduleItem = async (eventId, item) => {
  const { event } = await apiRequest(schedulePath(eventId), { method: 'POST', body: item });
  return event;
};

export const updateScheduleItem = async (eventId, itemId, changes) => {
  const { event } = await apiRequest(schedulePath(eventId, itemId), { method: 'PATCH', body: changes });
  return event;
};

export const deleteScheduleItem = async (eventId, itemId) => {
  const { event } = await apiRequest(schedulePath(eventId, itemId), { method: 'DELETE' });
  return event;
};

// going: true to join, false to leave
export const setGoing = async (eventId, itemId, going) => {
  const { event } = await apiRequest(`${schedulePath(eventId, itemId)}/going`, {
    method: going ? 'PUT' : 'DELETE'
  });
  return event;
};
