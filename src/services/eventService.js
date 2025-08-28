// Mock event service
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Mock events data
const mockEvents = [
  {
    _id: '1',
    name: "Summer Music Festival",
    date: "Apr 15-18, 2025",
    location: "Indio, CA",
    description: "Annual summer music festival with top artists",
    members: [
      { name: "Alex", color: "#3b82f6", _id: "user1" },
      { name: "Taylor", color: "#10b981", _id: "user2" },
      { name: "Jordan", color: "#8b5cf6", _id: "user3" },
      { name: "Jamie", color: "#f59e0b", _id: "user4" }
    ],
    schedule: [
      { time: "2:00 PM - 3:30 PM", activity: "Arctic Monkeys", location: "Main Stage", attending: 4 },
      { time: "4:00 PM - 5:00 PM", activity: "Tame Impala", location: "Sunset Stage", attending: 2 },
      { time: "5:30 PM - 6:30 PM", activity: "Billie Eilish", location: "Main Stage", attending: 1 },
      { time: "7:00 PM - 8:30 PM", activity: "The Strokes", location: "Desert Stage", attending: 0 }
    ],
    createdBy: 'user1',
    createdAt: '2025-04-01T00:00:00Z'
  },
  {
    _id: '2',
    name: "Hiking Trip",
    date: "May 10-12, 2025",
    location: "Smoky Mountains",
    description: "Weekend hiking adventure in the mountains",
    members: [
      { name: "Alex", color: "#3b82f6", _id: "user1" },
      { name: "Jordan", color: "#8b5cf6", _id: "user3" },
      { name: "Casey", color: "#ec4899", _id: "user5" }
    ],
    schedule: [
      { time: "9:00 AM - 12:00 PM", activity: "Morning Hike", location: "Trail Head", attending: 3 },
      { time: "1:00 PM - 3:00 PM", activity: "Lunch Break", location: "Summit", attending: 3 }
    ],
    createdBy: 'user1',
    createdAt: '2025-04-05T00:00:00Z'
  }
];

// Suggested events
const mockSuggestedEvents = [
  { _id: '3', name: "Coachella 2025", date: "Apr 10-19, 2025", location: "Indio, CA" },
  { _id: '4', name: "Lollapalooza", date: "Jul 30-Aug 2, 2025", location: "Chicago, IL" },
  { _id: '5', name: "Bonnaroo", date: "Jun 12-15, 2025", location: "Manchester, TN" }
];

// Simulate local storage for events
const EVENTS_KEY = 'eventbuddy_events';

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
  
  const newEvent = {
    ...eventData,
    _id: Date.now().toString(),
    members: eventData.invitedFriends ? 
      eventData.invitedFriends.map((name, index) => ({
        name,
        color: ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899'][index % 5],
        _id: `user${Date.now()}_${index}`
      })) : [],
    schedule: [],
    createdBy: 'current_user',
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
