import React, { createContext, useState, useContext } from 'react';
import { events, suggestedEvents } from '../data/mockData';

// Create context
const AppContext = createContext();

// Context provider component
export const AppProvider = ({ children }) => {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [selectedEvent, setSelectedEvent] = useState(null);
  
  // Navigation functions
  const navigateTo = (screen) => {
    setCurrentScreen(screen);
  };
  
  const selectEvent = (event) => {
    setSelectedEvent(event);
    navigateTo('eventDetails');
  };

  // Values to be provided to consumers
  const value = {
    currentScreen,
    navigateTo,
    selectedEvent,
    selectEvent,
    events,
    suggestedEvents
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