import React from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Footer from '../layout/Footer';
import { Button, Avatar } from '../common';
import { nearbyFriends } from '../../data/mockData';

const Map = () => {
  const { navigateTo } = useAppContext();
  
  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1">
        <MapView />
        <MapControls navigateTo={navigateTo} />
        <MapSearch navigateTo={navigateTo} />
      </div>
      
      <NearbyFriends friends={nearbyFriends} />
      <Footer />
    </div>
  );
};

// Map visualization component
const MapView = () => (
  <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
    <img src="https://placehold.co/400x400" alt="Map" className="w-full h-full object-cover" />
    
    {/* Friend locations */}
    <FriendMarker initial="A" color="#3b82f6" top="1/4" left="1/3" />
    <FriendMarker initial="T" color="#10b981" top="1/2" right="1/4" />
    <FriendMarker initial="J" color="#8b5cf6" bottom="1/4" left="1/2" />
    
    {/* Points of interest */}
    <PointOfInterest label="Main Stage" top="1/3" right="1/3" />
    <PointOfInterest label="Food Court" bottom="1/3" left="1/3" />
  </div>
);

// Friend location marker on map
const FriendMarker = ({ initial, color, top, left, right, bottom }) => (
  <div 
    className="absolute w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-xs"
    style={{ 
      backgroundColor: color,
      top: top ? `${top}` : 'auto',
      left: left ? `${left}` : 'auto',
      right: right ? `${right}` : 'auto',
      bottom: bottom ? `${bottom}` : 'auto'
    }}
  >
    {initial}
  </div>
);

// Point of interest marker on map
const PointOfInterest = ({ label, top, left, right, bottom }) => (
  <div 
    className="absolute bg-white p-1 rounded shadow-md text-xs"
    style={{ 
      top: top ? `${top}` : 'auto',
      left: left ? `${left}` : 'auto',
      right: right ? `${right}` : 'auto',
      bottom: bottom ? `${bottom}` : 'auto'
    }}
  >
    {label}
  </div>
);

// Map zoom controls
const MapControls = () => (
  <div className="absolute bottom-4 right-4 flex flex-col space-y-2">
    <button className="w-10 h-10 bg-white rounded-full shadow flex items-center justify-center">
      <Plus size={20} />
    </button>
    <button className="w-10 h-10 bg-white rounded-full shadow flex items-center justify-center">
      <div className="rotate-45">
        <Plus size={20} />
      </div>
    </button>
  </div>
);

// Search bar on map
const MapSearch = ({ navigateTo }) => (
  <div className="absolute top-4 left-4 right-4">
    <div className="bg-white rounded-full shadow px-4 py-2 flex items-center">
      <ArrowLeft size={20} onClick={() => navigateTo('home')} className="mr-2" />
      <input
        type="text"
        className="flex-1 outline-none"
        placeholder="Search venues, friends, etc."
      />
    </div>
  </div>
);

// Nearby friends section at bottom of map
const NearbyFriends = ({ friends }) => (
  <div className="bg-white border-t border-gray-200 p-4">
    <h3 className="font-medium mb-2">Nearby Friends</h3>
    <div className="flex space-x-4 mb-4">
      {friends.map((friend, index) => (
        <div key={index} className="flex flex-col items-center">
          <Avatar 
            initial={friend.initial} 
            color={friend.color}
            size="lg"
            status={friend.status === 'online'}
          />
          <span className="text-xs mt-1">{friend.name}</span>
          <span className="text-xs text-gray-500">{friend.minutes} min away</span>
        </div>
      ))}
    </div>
    
    <Button fullWidth variant="primary">
      Create Meetup Point
    </Button>
  </div>
);

export default Map;