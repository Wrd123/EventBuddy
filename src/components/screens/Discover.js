import React from 'react';
import Header from '../common/Header';
import Footer from '../layout/Footer';
import { useAppContext } from '../../context/AppContext';
import { suggestedEvents, recommendedArtists, popularEvents } from '../../data/mockData';

const Discover = () => {
  return (
    <div className="flex flex-col h-full">
      <Header title="Discover" />
      
      <div className="flex-1 overflow-y-auto pb-16">
        <SearchBar />
        
        <EventRecommendations />
        
        <ArtistRecommendations />
        
        <NearbyEvents />
      </div>
      
      <Footer />
    </div>
  );
};

const SearchBar = () => (
  <div className="p-4">
    <div className="relative">
      <input
        type="text"
        className="w-full bg-gray-100 rounded-full py-2 px-4 pl-10"
        placeholder="Search events, artists, venues..."
      />
      <div className="absolute left-3 top-2.5">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </div>
    </div>
  </div>
);

const EventRecommendations = () => (
  <div className="p-4">
    <h2 className="text-lg font-semibold mb-3">Based on Your Preferences</h2>
    <div className="flex overflow-x-auto space-x-3 pb-3">
      {suggestedEvents.map(event => (
        <div key={event.id} className="flex-shrink-0 w-40">
          <img 
            src="https://placehold.co/160x120" 
            alt={event.name} 
            className="w-full h-20 object-cover rounded-lg mb-2" 
          />
          <div className="font-medium text-sm">{event.name}</div>
          <div className="text-xs text-gray-500">{event.date}</div>
        </div>
      ))}
    </div>
  </div>
);

const ArtistRecommendations = () => (
  <div className="p-4">
    <h2 className="text-lg font-semibold mb-3">Artists You Might Like</h2>
    <div className="grid grid-cols-3 gap-3">
      {recommendedArtists.map(artist => (
        <div key={artist.id} className="text-center">
          <div className="w-full aspect-square bg-gray-200 rounded-lg mb-2 overflow-hidden">
            <img 
              src="https://placehold.co/120x120" 
              alt={artist.name} 
              className="w-full h-full object-cover" 
            />
          </div>
          <div className="text-sm font-medium">{artist.name}</div>
        </div>
      ))}
    </div>
  </div>
);

const NearbyEvents = () => (
  <div className="p-4">
    <h2 className="text-lg font-semibold mb-3">Popular Near You</h2>
    <div className="space-y-3">
      {popularEvents.map(event => (
        <div key={event.id} className="bg-white rounded-lg shadow p-3 flex">
          <img 
            src="https://placehold.co/80x80" 
            alt={event.name} 
            className="w-20 h-20 object-cover rounded-lg mr-3" 
          />
          <div className="flex-1">
            <div className="font-medium">{event.name}</div>
            <div className="text-sm text-gray-500 mb-1">
              {event.date} • {event.location}
            </div>
            <div className="text-xs text-purple-600">
              {event.interestedFriends} friends interested
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default Discover;