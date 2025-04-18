import React from 'react';
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

const MainLayout = () => {
  const { currentScreen } = useAppContext();

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

export default MainLayout;