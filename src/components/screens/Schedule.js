import React, { useState } from 'react';
import { Heart, Plus } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Header from '../common/Header';

const Schedule = () => {
  const { selectedEvent, navigateTo } = useAppContext();
  const [activeDay, setActiveDay] = useState(0);
  
  if (!selectedEvent) {
    navigateTo('eventDetails');
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Festival Schedule" 
        type="screen" 
        showBack={true} 
        showMenu={false} 
        showNotifications={false} 
        backScreen="eventDetails"
      />
      
      <div className="p-4 flex-1 overflow-y-auto">
        <DaySelector activeDay={activeDay} setActiveDay={setActiveDay} />
        
        <ScheduleItems items={selectedEvent.schedule} />
      </div>
    </div>
  );
};

const DaySelector = ({ activeDay, setActiveDay }) => {
  const days = ['Day 1', 'Day 2', 'Day 3'];
  
  return (
    <div className="flex overflow-x-auto space-x-2 mb-4">
      {days.map((day, index) => (
        <button 
          key={index}
          className={`flex-shrink-0 px-4 py-2 rounded-full ${
            activeDay === index 
              ? 'bg-purple-600 text-white' 
              : 'bg-white text-gray-700 border border-gray-200'
          }`}
          onClick={() => setActiveDay(index)}
        >
          {day}
        </button>
      ))}
    </div>
  );
};

const ScheduleItems = ({ items }) => (
  <div className="flex flex-col space-y-4">
    {items.map((item, index) => (
      <ScheduleItem key={index} item={item} />
    ))}
  </div>
);

const ScheduleItem = ({ item }) => {
  const [isFavorite, setIsFavorite] = useState(false);
  
  // Determine if this is a featured item
  const isFeatured = item.attending > 2;
  
  return (
    <div 
      className={`bg-white rounded-lg shadow p-3 ${
        isFeatured ? 'border-l-4 border-purple-600' : ''
      }`}
    >
      <div className="text-sm text-gray-500 mb-1">{item.time}</div>
      <div className="font-medium mb-1">{item.activity}</div>
      <div className="text-sm mb-2">{item.location}</div>
      
      <div className="flex justify-between items-center">
        <AttendeesList attending={item.attending} />
        
        {item.attending > 0 ? (
          <Heart 
            size={18} 
            className={isFavorite ? 'text-purple-600 fill-purple-600' : 'text-gray-300'} 
            onClick={() => setIsFavorite(!isFavorite)}
          />
        ) : (
          <button className="text-purple-600 text-xs font-medium flex items-center">
            <Plus size={14} className="mr-1" />
            Join
          </button>
        )}
      </div>
    </div>
  );
};

const AttendeesList = ({ attending }) => {
  if (attending === 0) {
    return <div className="text-xs text-gray-400">No one attending yet</div>;
  }
  
  // Sample colors for demo purposes
  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'];
  const initials = ['A', 'T', 'J', 'C'];
  
  return (
    <div className="flex space-x-1">
      <div className="flex -space-x-2">
        {Array.from({ length: Math.min(attending, 3) }).map((_, index) => (
          <div 
            key={index} 
            className="w-6 h-6 rounded-full border border-white flex items-center justify-center text-white text-xs"
            style={{ backgroundColor: colors[index] }}
          >
            {initials[index]}
          </div>
        ))}
        
        {attending > 3 && (
          <div className="w-6 h-6 bg-gray-500 rounded-full border border-white flex items-center justify-center text-white text-xs">
            +{attending - 3}
          </div>
        )}
      </div>
      <div className="text-xs text-gray-500 self-center ml-1">attending</div>
    </div>
  );
};

export default Schedule;