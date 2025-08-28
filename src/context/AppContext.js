import React, { createContext, useState, useContext, useEffect } from 'react';
import * as authService from '../services/authService';
import * as eventService from '../services/eventService';
import * as userService from '../services/userService';

// Create context
const AppContext = createContext();

// Context provider component
export const AppProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentScreen, setCurrentScreen] = useState('home');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [suggestedEvents, setSuggestedEvents] = useState([]);
  const [error, setError] = useState(null);
  
  // Initialize authentication state
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Check if user is logged in
        const user = authService.getCurrentUser();
        
        if (user) {
          setCurrentUser(user);
          setIsAuthenticated(true);
          
          // Fetch latest user data from API
          const profileData = await authService.getProfile();
          setCurrentUser(profileData);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        // Handle expired or invalid token
        authService.logout();
      } finally {
        setIsLoading(false);
      }
    };
    
    initAuth();
  }, []);
  
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
      navigateTo('home');
      
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
      navigateTo('home');
      
      return response;
    } catch (error) {
      setError(error.message || 'Registration failed. Please try again.');
      throw error;
    }
  };
  
  const logout = () => {
    authService.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setEvents([]);
    setSuggestedEvents([]);
    navigateTo('login');
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
      
      // Add new event to state
      setEvents([...events, response.event]);
      
      // Select the new event
      selectEvent(response.event);
      
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
      const updatedEvents = events.map(event => 
        event._id === eventId ? response.event : event
      );
      
      setEvents(updatedEvents);
      
      // Update selected event if it's the current one
      if (selectedEvent && selectedEvent._id === eventId) {
        setSelectedEvent(response.event);
      }
      
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
      setEvents(events.filter(event => event._id !== eventId));
      
      // Clear selected event if it's the deleted one
      if (selectedEvent && selectedEvent._id === eventId) {
        setSelectedEvent(null);
      }
      
      navigateTo('home');
    } catch (error) {
      setError(error.message || 'Failed to delete event.');
      throw error;
    }
  };
  
  // Navigation functions
  const navigateTo = (screen) => {
    setCurrentScreen(screen);
  };
  
  const selectEvent = async (event) => {
    try {
      // Fetch full event details
      const eventDetails = await eventService.getEventById(event._id);
      
      setSelectedEvent(eventDetails);
      navigateTo('eventDetails');
    } catch (error) {
      console.error('Select event error:', error);
      setError('Failed to load event details.');
    }
  };

  // Clear any errors
  const clearError = () => {
    setError(null);
  };

  // Values to be provided to consumers
  const value = {
    currentUser,
    isAuthenticated,
    isLoading,
    currentScreen,
    navigateTo,
    selectedEvent,
    selectEvent,
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
    deleteEvent: deleteEventData
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