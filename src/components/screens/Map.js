import React from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Footer from '../layout/Footer';
import { Button, Avatar } from '../common';
import { nearbyFriends } from '../../data/mockData';

const Map = () => {
  const navigate = useNavigate();
  
  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1">
        <MapView />
        <MapControls />
        <MapSearch onBack={() => navigate('/')} />
      </div>
      
      <NearbyFriends friends={nearbyFriends} />
      <Footer />
    </div>
  );
};

// Map visualization component
// Positions are CSS percentages of the map area. (Preview only: the map
// isn't connected to real locations yet.)
const MapView = () => (
  <div className="absolute inset-0 bg-night overflow-hidden">
    <MapArt />
    
    {/* Friend locations */}
    <FriendMarker initial="A" color="#3b82f6" top="28%" left="30%" />
    <FriendMarker initial="T" color="#10b981" top="50%" right="22%" />
    <FriendMarker initial="J" color="#8b5cf6" bottom="22%" left="48%" />
    
    {/* Points of interest */}
    <PointOfInterest label="Main Stage" top="36%" right="34%" />
    <PointOfInterest label="Food Court" bottom="36%" left="18%" />
  </div>
);

// A dark, stylized street map: blocks, a park, a lake and main roads
const MapArt = () => (
  <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full" aria-hidden="true">
    <rect width="400" height="500" fill="#100d28" />
    <path d="M40 300 Q90 250 150 280 T220 360 Q180 420 110 400 T40 300 Z" fill="#163a35" />
    <ellipse cx="320" cy="120" rx="60" ry="38" fill="#152a52" />
    <g stroke="#2a2552" strokeWidth="10">
      {[60, 140, 220, 300, 380, 460].map(y => <line key={y} x1="0" y1={y} x2="400" y2={y} />)}
      {[50, 130, 210, 290, 370].map(x => <line key={x} x1={x} y1="0" x2={x} y2="500" />)}
    </g>
    <path d="M-10 420 L410 80" stroke="#3b2f78" strokeWidth="18" />
    <path d="M-10 420 L410 80" stroke="#6d5bd0" strokeWidth="2" strokeDasharray="10 10" />
  </svg>
);

// Friend location marker on map
const FriendMarker = ({ initial, color, top, left, right, bottom }) => (
  <div 
    className="absolute w-8 h-8 rounded-full border-2 border-night flex items-center justify-center text-white text-xs"
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
    className="absolute bg-surface p-1 rounded text-xs"
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
    <button className="w-10 h-10 bg-surface rounded-full flex items-center justify-center">
      <Plus size={20} />
    </button>
    <button className="w-10 h-10 bg-surface rounded-full flex items-center justify-center">
      <div className="rotate-45">
        <Plus size={20} />
      </div>
    </button>
  </div>
);

// Search bar on map
const MapSearch = ({ onBack }) => (
  <div className="absolute top-4 left-4 right-4">
    <div className="bg-surface/95 border border-line backdrop-blur rounded-full px-4 py-2.5 flex items-center">
      <button onClick={onBack} className="mr-2" aria-label="Back">
        <ArrowLeft size={20} />
      </button>
      <input
        type="search"
        aria-label="Search venues and friends"
        className="flex-1 outline-none bg-transparent placeholder-faint"
        placeholder="Search venues, friends, etc."
      />
    </div>
  </div>
);

// Nearby friends section at bottom of map
const NearbyFriends = ({ friends }) => (
  <div className="bg-surface border-t border-line p-4">
    <h3 className="font-medium mb-2">Nearby Friends</h3>
    <div className="flex space-x-4 mb-4">
      {friends.map((friend) => (
        <div key={friend._id} className="flex flex-col items-center">
          <Avatar 
            initial={friend.initial} 
            color={friend.color}
            size="lg"
            status={friend.status === 'online'}
          />
          <span className="text-xs mt-1">{friend.name}</span>
          <span className="text-xs text-muted">{friend.minutes} min away</span>
        </div>
      ))}
    </div>
    
    <Button fullWidth variant="primary">
      Create Meetup Point
    </Button>
  </div>
);

export default Map;