import React, { useState } from 'react';
import { Music, Calendar, Map, Users, CheckCircle, Plus } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Header from '../common/Header';
import { Button } from '../common';

const CreateEvent = () => {
  // eslint-disable-next-line no-unused-vars -- TODO(you): delete once handleSubmit uses it
  const { createEvent } = useAppContext();
  const [eventData, setEventData] = useState({
    name: '',
    type: 'music-festival',
    date: '',
    location: '',
    invitedFriends: ['Alex', 'Taylor', 'Jordan']
  });
  // eslint-disable-next-line no-unused-vars -- TODO(you): delete once handleSubmit uses it
  const [error, setError] = useState('');
  // eslint-disable-next-line no-unused-vars -- TODO(you): delete once handleSubmit uses it
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field, value) => {
    setEventData({
      ...eventData,
      [field]: value
    });
  };

  const handleEventTypeSelect = (type) => {
    handleChange('type', type);
  };

  const handleSubmit = async () => {
    // TODO(you): validate eventData and save it.
    //
    // Available here:
    //   eventData        -> { name, type, date, location, invitedFriends }
    //   createEvent(data) -> async; on success it adds the event to state
    //                        and navigates to its details screen; on failure
    //                        it throws an Error with a .message
    //   setError(msg)     -> shows a red banner above the form ('' hides it)
    //   setIsSubmitting(bool) -> disables the button while saving
    //
    // Decisions to make:
    //   - Which fields are required? (name? date? at least one friend?)
    //   - Trim whitespace before checking / saving?
    //   - On failure, keep the form filled in so the user can retry?
  };

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Create New Event" 
        type="screen" 
        showBack={true} 
        showMenu={false} 
        showNotifications={false}
      />
      
      <div className="p-4 flex-1 overflow-y-auto">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <EventNameInput 
          value={eventData.name} 
          onChange={(value) => handleChange('name', value)} 
        />
        
        <EventTypeSelector 
          selectedType={eventData.type} 
          onSelect={handleEventTypeSelect} 
        />
        
        <DateInput 
          value={eventData.date} 
          onChange={(value) => handleChange('date', value)} 
        />
        
        <LocationInput 
          value={eventData.location} 
          onChange={(value) => handleChange('location', value)} 
        />
        
        <FriendSelector 
          selectedFriends={eventData.invitedFriends} 
          onToggleFriend={(friend) => {
            const friends = eventData.invitedFriends.includes(friend)
              ? eventData.invitedFriends.filter(f => f !== friend)
              : [...eventData.invitedFriends, friend];
            handleChange('invitedFriends', friends);
          }} 
        />
      </div>
      
      <div className="p-4 border-t border-gray-200">
        <Button 
          onClick={handleSubmit}
          fullWidth
          variant="primary"
          size="lg"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create Event'}
        </Button>
      </div>
    </div>
  );
};

const EventNameInput = ({ value, onChange }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Event Name
    </label>
    <input
      type="text"
      className="w-full p-2 border border-gray-300 rounded-lg"
      placeholder="Summer Music Festival 2025"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const EventTypeSelector = ({ selectedType, onSelect }) => {
  const eventTypes = [
    { id: 'music-festival', label: 'Music Festival', icon: Music },
    { id: 'concert', label: 'Concert', icon: Calendar },
    { id: 'outdoor', label: 'Outdoor Trip', icon: Map },
    { id: 'group-travel', label: 'Group Travel', icon: Users }
  ];

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Event Type
      </label>
      <div className="grid grid-cols-2 gap-2">
        {eventTypes.map((type) => {
          const Icon = type.icon;
          const isSelected = selectedType === type.id;
          
          return (
            <button
              key={type.id}
              className={`border p-2 rounded-lg flex items-center justify-center ${
                isSelected 
                  ? 'border-purple-600 bg-purple-50 text-purple-600' 
                  : 'border-gray-300 text-gray-700'
              }`}
              onClick={() => onSelect(type.id)}
            >
              <Icon className="mr-2" size={16} />
              {type.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const DateInput = ({ value, onChange }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Date & Time
    </label>
    <input
      type="text"
      className="w-full p-2 border border-gray-300 rounded-lg"
      placeholder="Jun 15-18, 2025"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const LocationInput = ({ value, onChange }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Location
    </label>
    <input
      type="text"
      className="w-full p-2 border border-gray-300 rounded-lg"
      placeholder="Indio, CA"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const FriendSelector = ({ selectedFriends, onToggleFriend }) => {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Invite Friends
      </label>
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedFriends.map((name) => (
          <div 
            key={name} 
            className="flex items-center bg-purple-100 text-purple-600 px-3 py-1 rounded-full"
            onClick={() => onToggleFriend(name)}
          >
            <span>{name}</span>
            <CheckCircle size={16} className="ml-1" />
          </div>
        ))}
        <div 
          className="flex items-center border border-dashed border-gray-300 px-3 py-1 rounded-full"
          onClick={() => {
            // In a real app, this would open a friend selection modal
          }}
        >
          <Plus size={16} className="mr-1" />
          <span>Add</span>
        </div>
      </div>
    </div>
  );
};

export default CreateEvent;