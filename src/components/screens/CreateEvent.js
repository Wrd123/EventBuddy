import React, { useState } from 'react';
import { Music, Calendar, Map, Users, CheckCircle, Plus } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Header from '../common/Header';
import { Button } from '../common';
import { todayISO } from '../../utils/dates';

export const MAX_NAME_LENGTH = 60;

// Returns the first problem as a user-facing message, or '' if valid.
// Expects trimmed values; handleSubmit trims before calling it.
// Dates are "YYYY-MM-DD" strings, which compare correctly as strings.
export const validateEvent = ({ name, startDate, endDate }, today = todayISO()) => {
  if (!name) return 'Please enter an event name.';
  if (name.length > MAX_NAME_LENGTH) return `Event name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  if (!startDate) return 'Please choose a date.';
  if (startDate < today) return "The event can't start in the past.";
  if (!endDate) return 'Please choose an end date.';
  if (endDate < startDate) return 'The end date must be on or after the start date.';
  return '';
};

const CreateEvent = () => {
  const { createEvent } = useAppContext();
  const [eventData, setEventData] = useState({
    name: '',
    type: 'music-festival',
    isMultiDay: false,
    startDate: '',
    endDate: '',
    location: '',
    invitedFriends: ['Alex', 'Taylor', 'Jordan']
  });
  const [error, setError] = useState('');
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
    if (isSubmitting) return;
    setError('');

    // Validate and save the trimmed values, not the raw input.
    // A single-day event ends on the day it starts; isMultiDay is form-only.
    const { isMultiDay, ...fields } = eventData;
    const cleaned = {
      ...fields,
      name: fields.name.trim(),
      endDate: isMultiDay ? fields.endDate : fields.startDate,
      location: fields.location.trim()
    };

    const validationError = validateEvent(cleaned);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      // createEvent navigates to the new event itself
      await createEvent(cleaned);
    } catch (err) {
      setError(err.message || 'Could not create the event. Please try again.');
      // Only re-enable on failure: on success createEvent returns before the
      // screen changes, and re-enabling would allow a duplicate submit.
      // The form keeps its values so the user can retry.
      setIsSubmitting(false);
    }
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
          maxLength={MAX_NAME_LENGTH}
          onChange={(value) => handleChange('name', value)} 
        />
        
        <EventTypeSelector 
          selectedType={eventData.type} 
          onSelect={handleEventTypeSelect} 
        />
        
        <DateFields 
          isMultiDay={eventData.isMultiDay}
          startDate={eventData.startDate}
          endDate={eventData.endDate}
          onChange={handleChange} 
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

const EventNameInput = ({ value, maxLength, onChange }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Event Name
    </label>
    <input
      type="text"
      className="w-full p-2 border border-gray-300 rounded-lg"
      placeholder="Summer Music Festival 2025"
      maxLength={maxLength}
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

// type="date" opens the phone's native date picker and always yields
// "YYYY-MM-DD". min blocks past days in the picker; validateEvent still
// checks, since min isn't enforced on typed input in every browser.
const DateFields = ({ isMultiDay, startDate, endDate, onChange }) => {
  const today = todayISO();

  return (
    <div className="mb-4">
      <label className="flex items-center mb-2 text-sm text-gray-700">
        <input
          type="checkbox"
          className="mr-2 h-4 w-4 accent-purple-600"
          checked={isMultiDay}
          onChange={(e) => onChange('isMultiDay', e.target.checked)}
        />
        Multi-day event
      </label>

      <div className={isMultiDay ? 'grid grid-cols-2 gap-2' : ''}>
        <div>
          <label htmlFor="event-start-date" className="block text-sm font-medium text-gray-700 mb-1">
            {isMultiDay ? 'Start date' : 'Date'}
          </label>
          <input
            id="event-start-date"
            type="date"
            className="w-full p-2 border border-gray-300 rounded-lg bg-white"
            min={today}
            value={startDate}
            onChange={(e) => onChange('startDate', e.target.value)}
          />
        </div>

        {isMultiDay && (
          <div>
            <label htmlFor="event-end-date" className="block text-sm font-medium text-gray-700 mb-1">
              End date
            </label>
            <input
              id="event-end-date"
              type="date"
              className="w-full p-2 border border-gray-300 rounded-lg bg-white"
              min={startDate || today}
              value={endDate}
              onChange={(e) => onChange('endDate', e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

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