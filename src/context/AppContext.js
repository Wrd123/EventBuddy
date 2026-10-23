import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import * as authService from '../services/authService';
import * as eventService from '../services/eventService';
import { setUnauthorizedHandler } from '../services/api';

// Create context
const AppContext = createContext();

// Context provider component: auth and event data. Navigation lives in the
// router (see MainLayout), so nothing here changes screens.
export const AppProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [suggestedEvents, setSuggestedEvents] = useState([]);
  const [error, setError] = useState(null);
  // True after the user taps Log Out (vs. a session that expired), so the
  // login guard doesn't send the next login back to the page they left
  const [loggedOutByUser, setLoggedOutByUser] = useState(false);
  
  // Drop the session locally (no navigation; the router's guards react to it).
  // Stable identity, since the effects below depend on it.
  const clearSession = useCallback(() => {
    authService.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setEvents([]);
    setSuggestedEvents([]);
  }, []);

  // If the server rejects our token mid-session (expired), log out
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(() => {});
  }, [clearSession]);

  // Initialize authentication state
  useEffect(() => {
    const initAuth = async () => {
      // Start from the cached user so the app opens instantly
      const user = authService.getCurrentUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      setCurrentUser(user);
      setIsAuthenticated(true);
      setIsLoading(false);

      try {
        // Refresh from the server, which also confirms the token is valid
        setCurrentUser(await authService.getProfile());
      } catch (error) {
        // Only an explicit rejection ends the session. Offline or a server
        // hiccup keeps the cached user, as phone apps do.
        if (error.status === 401) clearSession();
      }
    };

    initAuth();
  }, [clearSession]);
  
  // Fetch events when authenticated
  useEffect(() => {
    const fetchEvents = async () => {
      if (isAuthenticated) {
        try {
          // Fetch user events
          const userEvents = await eventService.getUserEvents();
          setEvents(userEvents);
          
          // Fetch suggested events
          const suggestedEventsData = await eventService.getSuggestedEvents();
          setSuggestedEvents(suggestedEventsData);
        } catch (error) {
          console.error('Fetch events error:', error);
          setError('Failed to load events. Please try again.');
        }
      }
    };
    
    fetchEvents();
  }, [isAuthenticated]);
  
  // Authentication functions
  const login = async (credentials) => {
    try {
      const response = await authService.login(credentials);
      
      setCurrentUser(response.user);
      setIsAuthenticated(true);
      setLoggedOutByUser(false);
      
      return response;
    } catch (error) {
      setError(error.message || 'Login failed. Please check your credentials.');
      throw error;
    }
  };
  
  const register = async (userData) => {
    try {
      const response = await authService.register(userData);
      
      setCurrentUser(response.user);
      setIsAuthenticated(true);
      setLoggedOutByUser(false);
      
      return response;
    } catch (error) {
      setError(error.message || 'Registration failed. Please try again.');
      throw error;
    }
  };
  
  const logout = () => {
    clearSession();
    setLoggedOutByUser(true);
  };
  
  const updateProfile = async (profileData) => {
    try {
      const response = await authService.updateProfile(profileData);
      setCurrentUser(response.user);
      return response;
    } catch (error) {
      setError(error.message || 'Failed to update profile.');
      throw error;
    }
  };
  
  // Event functions
  const createNewEvent = async (eventData) => {
    try {
      const response = await eventService.createEvent(eventData);
      
      // Add new event to state; the caller decides where to go next
      setEvents(prev => [...prev, response.event]);
      
      return response;
    } catch (error) {
      setError(error.message || 'Failed to create event.');
      throw error;
    }
  };
  
  const updateEventData = async (eventId, eventData) => {
    try {
      const response = await eventService.updateEvent(eventId, eventData);
      
      // Update event in state
      setEvents(prev => prev.map(event => 
        event._id === eventId ? response.event : event
      ));
      
      return response;
    } catch (error) {
      setError(error.message || 'Failed to update event.');
      throw error;
    }
  };
  
  const deleteEventData = async (eventId) => {
    try {
      await eventService.deleteEvent(eventId);
      
      // Remove event from state
      setEvents(prev => prev.filter(event => event._id !== eventId));
    } catch (error) {
      setError(error.message || 'Failed to delete event.');
      throw error;
    }
  };
  
  // Replace an event in the list with a fresh copy from the server, or add it
  // if the list doesn't have it yet (e.g. it was opened from a link)
  const storeEvent = (updated) => {
    setEvents(prev =>
      prev.some(event => event._id === updated._id)
        ? prev.map(event => (event._id === updated._id ? updated : event))
        : [...prev, updated]
    );
    return updated;
  };

  // Schedule actions. Errors are thrown for the screen to show next to the
  // form or button, rather than stored in the shared error state.
  const addScheduleItem = async (eventId, item) =>
    storeEvent(await eventService.addScheduleItem(eventId, item));

  const updateScheduleItem = async (eventId, itemId, changes) =>
    storeEvent(await eventService.updateScheduleItem(eventId, itemId, changes));

  const deleteScheduleItem = async (eventId, itemId) =>
    storeEvent(await eventService.deleteScheduleItem(eventId, itemId));

  const setGoing = async (eventId, itemId, going) =>
    storeEvent(await eventService.setGoing(eventId, itemId, going));

  // Invites: joining adds the event to your list right away
  const joinEvent = async (inviteCode) =>
    storeEvent(await eventService.joinInvite(inviteCode));

  const resetInviteLink = async (eventId) =>
    storeEvent(await eventService.resetInviteLink(eventId));

  // Clear any errors
  const clearError = () => {
    setError(null);
  };

  // Values to be provided to consumers
  const value = {
    currentUser,
    isAuthenticated,
    isLoading,
    loggedOutByUser,
    events,
    suggestedEvents,
    error,
    clearError,
    login,
    register,
    logout,
    updateProfile,
    createEvent: createNewEvent,
    updateEvent: updateEventData,
    deleteEvent: deleteEventData,
    addScheduleItem,
    updateScheduleItem,
    deleteScheduleItem,
    setGoing,
    joinEvent,
    resetInviteLink
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// Custom hook for using the context
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};