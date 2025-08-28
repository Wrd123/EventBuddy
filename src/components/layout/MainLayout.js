import React, { useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import Footer from './Footer';

// Import all screens
import Home from '../screens/Home';
import EventDetails from '../screens/EventDetails';
import CreateEvent from '../screens/CreateEvent';
import Map from '../screens/Map';
import Expenses from '../screens/Expenses';
import Schedule from '../screens/Schedule';
import GroupChat from '../screens/GroupChat';
import Discover from '../screens/Discover';
import Groups from '../screens/Groups';
import Login from '../screens/Login';
import Register from '../screens/Register';
import Profile from '../screens/Profile';

const MainLayout = () => {
  const { currentScreen, isAuthenticated, isLoading, navigateTo } = useAppContext();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated && 
        !['login', 'register'].includes(currentScreen)) {
      navigateTo('login');
    }
  }, [isAuthenticated, isLoading, currentScreen, navigateTo]);

  // Show loading screen
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Render auth screens if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="w-full h-full max-w-md mx-auto bg-gray-100 overflow-hidden relative" style={{ maxHeight: '640px' }}>
        {currentScreen === 'login' ? <Login /> : <Register />}
      </div>
    );
  }

  // Render the current screen based on context state
  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <Home />;
      case 'eventDetails':
        return <EventDetails />;
      case 'createEvent':
        return <CreateEvent />;
      case 'map':
        return <Map />;
      case 'expenses':
        return <Expenses />;
      case 'schedule':
        return <Schedule />;
      case 'groupChat':
        return <GroupChat />;
      case 'discover':
        return <Discover />;
      case 'groups':
        return <Groups />;
      case 'profile':
        return <Profile />;
      default:
        return <Home />;
    }
  };

  return (
    <div className="w-full h-full max-w-md mx-auto bg-gray-100 overflow-hidden relative" style={{ maxHeight: '640px' }}>
      {renderScreen()}
      {/* The Footer component is conditionally rendered in individual screens when needed */}
    </div>
  );
};

// Loading screen component
const LoadingScreen = () => (
  <div className="w-full h-full max-w-md mx-auto bg-white flex items-center justify-center" style={{ maxHeight: '640px' }}>
    <div className="text-center">
      <div className="animate-pulse text-3xl text-purple-600 font-bold mb-4">
        EventBuddy
      </div>
      <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p className="mt-4 text-gray-600">Loading...</p>
    </div>
  </div>
);

export default MainLayout;