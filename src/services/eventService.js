// Mock event service
import { events as mockEvents, suggestedEvents as mockSuggestedEvents } from '../data/mockData';
import { getCurrentUser } from './authService';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Simulate local storage for events. Bump the version when the stored
// event shape changes so old data isn't read in the new format
// (v2: free-text `date` became `startDate`/`endDate`).
const EVENTS_KEY = 'eventbuddy_events_v2';

const getStoredEvents = () => {
  const stored = localStorage.getItem(EVENTS_KEY);
  return stored ? JSON.parse(stored) : [...mockEvents];
};

const setStoredEvents = (events) => {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
};

export const getUserEvents = async () => {
  await delay(800);
  return getStoredEvents();
};

export const getSuggestedEvents = async () => {
  await delay(500);
  return [...mockSuggestedEvents];
};

export const getEventById = async (eventId) => {
  await delay(300);
  const events = getStoredEvents();
  const event = events.find(e => e._id === eventId);
  
  if (!event) {
    throw new Error('Event not found');
  }
  
  return event;
};

export const createEvent = async (eventData) => {
  await delay(1000);
  
  // A real API would take the creator from the auth token, not the request body
  const creator = getCurrentUser();
  if (!creator) {
    throw new Error('You need to be logged in to create an event.');
  }
  
  const invitedMembers = (eventData.invitedFriends || []).map((name, index) => ({
    name,
    color: ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899'][index % 5],
    _id: `user${Date.now()}_${index}`
  }));
  
  const newEvent = {
    ...eventData,
    _id: Date.now().toString(),
    // Creator is always the first member; purple matches "you" in GroupChat
    members: [{ _id: creator._id, name: creator.name, color: '#7c3aed' }, ...invitedMembers],
    schedule: [],
    createdBy: creator._id,
    createdAt: new Date().toISOString()
  };
  
  const events = getStoredEvents();
  const updatedEvents = [...events, newEvent];
  setStoredEvents(updatedEvents);
  
  return {
    event: newEvent,
    message: 'Event created successfully'
  };
};

export const updateEvent = async (eventId, eventData) => {
  await delay(800);
  
  const events = getStoredEvents();
  const eventIndex = events.findIndex(e => e._id === eventId);
  
  if (eventIndex === -1) {
    throw new Error('Event not found');
  }
  
  const updatedEvent = {
    ...events[eventIndex],
    ...eventData,
    updatedAt: new Date().toISOString()
  };
  
  events[eventIndex] = updatedEvent;
  setStoredEvents(events);
  
  return {
    event: updatedEvent,
    message: 'Event updated successfully'
  };
};

export const deleteEvent = async (eventId) => {
  await delay(500);
  
  const events = getStoredEvents();
  const filteredEvents = events.filter(e => e._id !== eventId);
  
  if (filteredEvents.length === events.length) {
    throw new Error('Event not found');
  }
  
  setStoredEvents(filteredEvents);
  
  return {
    message: 'Event deleted successfully'
  };
};
