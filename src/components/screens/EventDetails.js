import React from 'react';
import { Calendar, MessageSquare, DollarSign, Map, Plus } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Header from '../common/Header';
import { Avatar, Button } from '../common';

const EventDetails = () => {
  const { selectedEvent, navigateTo } = useAppContext();

  if (!selectedEvent) {
    navigateTo('home');
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      <Header 
        title={selectedEvent.name} 
        type="screen" 
        showBack={true} 
        showMenu={false} 
        showNotifications={false}
      />
      
      <div className="flex-1 overflow-y-auto pb-16">
        <EventCover event={selectedEvent} />
        <EventActions navigateTo={navigateTo} />
        <EventContent event={selectedEvent} />
      </div>
    </div>
  );
};

const EventCover = ({ event }) => (
  <div className="relative">
    <img 
      src="https://placehold.co/400x200" 
      alt="Event cover" 
      className="w-full h-48 object-cover" 
    />
    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
      <h2 className="text-white text-xl font-bold">{event.name}</h2>
      <p className="text-white">{event.date} • {event.location}</p>
    </div>
  </div>
);

const EventActions = ({ navigateTo }) => (
  <div className="flex justify-around p-3 bg-white border-b border-gray-200">
    <ActionButton 
      Icon={Calendar} 
      label="Schedule"
      onClick={() => navigateTo('schedule')}
    />
    <ActionButton 
      Icon={MessageSquare} 
      label="Group Chat"
      onClick={() => navigateTo('groupChat')}
    />
    <ActionButton 
      Icon={DollarSign} 
      label="Expenses"
      onClick={() => navigateTo('expenses')}
    />
    <ActionButton 
      Icon={Map} 
      label="Map"
      onClick={() => navigateTo('eventMap')}
    />
  </div>
);

const ActionButton = ({ Icon, label, onClick }) => (
  <button 
    onClick={onClick} 
    className="flex flex-col items-center text-gray-700"
  >
    <Icon size={20} />
    <span className="text-xs mt-1">{label}</span>
  </button>
);

const EventContent = ({ event }) => (
  <div className="p-4">
    <h3 className="text-lg font-semibold mb-2">Group Members</h3>
    <div className="flex space-x-2 mb-4">
      {event.members.map((member, index) => (
        <div key={index} className="flex flex-col items-center">
          <Avatar 
            initial={member.name.charAt(0)} 
            color={member.color} 
            size="md" 
          />
          <span className="text-xs mt-1">{member.name}</span>
        </div>
      ))}
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 border border-dashed border-purple-300">
          <Plus size={16} />
        </div>
        <span className="text-xs mt-1">Invite</span>
      </div>
    </div>
    
    <h3 className="text-lg font-semibold mb-2">Today's Schedule</h3>
    <div className="flex flex-col space-y-3">
      {event.schedule.map((item, index) => (
        <ScheduleItem key={index} item={item} />
      ))}
    </div>
  </div>
);

const ScheduleItem = ({ item }) => (
  <div className="border border-gray-200 rounded-lg p-3">
    <div className="flex justify-between items-start">
      <div>
        <div className="text-sm text-gray-500">{item.time}</div>
        <div className="font-medium">{item.activity}</div>
        <div className="text-sm">{item.location}</div>
      </div>
      <div className="bg-purple-100 text-purple-600 px-2 py-1 rounded text-xs">
        {item.attending} attending
      </div>
    </div>
  </div>
);

export default EventDetails;