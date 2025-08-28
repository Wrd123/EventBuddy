import React, { useState } from 'react';
import { MapPin, Navigation, RefreshCw, Music, Users } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useLocation } from '../../hooks/useLocation';
import Header from '../common/Header';
import Footer from '../layout/Footer';
import LocationPermissionModal from '../common/LocationPermissionModal';
import { EventCard, SuggestedEventCard } from '../common';

const Home = () => {
  const { events, suggestedEvents, selectEvent, currentUser } = useAppContext();
  const {
    nearbyEvents,
    isLoadingLocation,
    isLoadingEvents,
    hasLocation,
    requestLocation,
    getLocationString,
    isLocationAvailable
  } = useLocation();

  const [showLocationModal, setShowLocationModal] = useState(false);

  const handleRequestLocation = async () => {
    try {
      await requestLocation();
      setShowLocationModal(false);
    } catch (error) {
      console.error('Failed to get location:', error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="EventBuddy" />
      
      <div className="flex-1 overflow-y-auto pb-16">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-800 text-white p-6">
          <h2 className="text-2xl font-bold mb-2">
            {currentUser ? `Hey ${currentUser.name?.split(' ')[0]}! 🎵` : 'Welcome! 🎵'}
          </h2>
          <p className="text-purple-100 mb-4">
            You have {events.length} upcoming events
          </p>
        </div>

        {/* Location-based Events Section */}
        <div className="p-4 bg-gradient-to-r from-green-50 to-blue-50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold flex items-center">
              <MapPin size={20} className="mr-2 text-green-600" />
              Near {getLocationString()}
            </h3>
            
            {!hasLocation && isLocationAvailable && (
              <button
                onClick={() => setShowLocationModal(true)}
                className="flex items-center text-green-600 text-sm font-medium bg-green-100 px-3 py-1 rounded-full"
              >
                <Navigation size={14} className="mr-1" />
                Enable Location
              </button>
            )}
          </div>

          {/* Nearby Events */}
          {isLoadingEvents ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent"></div>
              <span className="ml-3 text-gray-600">Finding events near you...</span>
            </div>
          ) : nearbyEvents.length > 0 ? (
            <div className="grid grid-cols-1 gap-3">
              {nearbyEvents.map((event) => (
                <div key={event._id} className="bg-white rounded-lg shadow-md p-4">
                  <h4 className="font-semibold text-gray-800">{event.name}</h4>
                  <p className="text-sm text-gray-600">{event.date}</p>
                  <div className="flex items-center text-sm text-gray-500 mt-1">
                    <MapPin size={14} className="mr-1" />
                    <span>{event.location} • {event.distance}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <MapPin size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Enable location to see events near you</p>
            </div>
          )}
        </div>

        {/* Your existing events */}
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-3">Your Events</h3>
          <div className="flex flex-col space-y-3">
            {events.map((event) => (
              <EventCard 
                key={event.id} 
                event={event} 
                onSelect={() => selectEvent(event)} 
              />
            ))}
          </div>
        </div>
        
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-3">Suggested For You</h3>
          <div className="flex overflow-x-auto space-x-3 pb-2">
            {suggestedEvents.map((event) => (
              <SuggestedEventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      </div>
      
      {/* Location Permission Modal */}
      <LocationPermissionModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onRequestLocation={handleRequestLocation}
        isLoading={isLoadingLocation}
      />
      
      <Footer />
    </div>
  );
};

export default Home;