import React, { useState, useEffect, useRef } from 'react';
import { Heart, Plus } from 'lucide-react';
import { useParams } from 'react-router-dom';
import Header from '../common/Header';
import { ScreenLoader } from '../common';
import NotFound from './NotFound';
import { useEvent } from '../../hooks/useEvent';
import { eachDay, formatDay, defaultScheduleDay } from '../../utils/dates';

const Schedule = () => {
  const { eventId } = useParams();
  const { event, status, error } = useEvent(eventId);
  // null until the user picks a tab; until then show the default day.
  // Derived rather than initial state, since the event may still be loading.
  const [chosenDay, setChosenDay] = useState(null);

  if (status === 'loading') return <ScreenLoader />;
  if (status === 'not-found') {
    return <NotFound title="Event not found" message="This event doesn't exist or was deleted." />;
  }
  if (status === 'error') {
    return <NotFound title="Couldn't load event" message={error} />;
  }

  const activeDay = chosenDay ?? defaultScheduleDay(event);

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Schedule" 
        type="screen" 
        showBack={true} 
        showProfile={false} 
        showNotifications={false} 
        backTo={`/events/${eventId}`}
      />
      
      <div className="p-4 flex-1 overflow-y-auto">
        <DaySelector 
          days={eachDay(event.startDate, event.endDate)} 
          activeDay={activeDay} 
          setActiveDay={setChosenDay} 
        />
        
        <ScheduleItems items={event.schedule.filter(item => item.date === activeDay)} />
      </div>
    </div>
  );
};

const DaySelector = ({ days, activeDay, setActiveDay }) => {
  const activeRef = useRef(null);

  // Long events have more tabs than fit; keep the selected one visible,
  // e.g. when the schedule opens on day 6 of a festival
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeDay]);

  return (
    <div className="flex overflow-x-auto no-scrollbar space-x-2 mb-4">
      {days.map((day) => (
        <button 
          key={day}
          ref={activeDay === day ? activeRef : null}
          className={`flex-shrink-0 px-4 py-2 rounded-full ${
            activeDay === day 
              ? 'bg-purple-600 text-white' 
              : 'bg-white text-gray-700 border border-gray-200'
          }`}
          onClick={() => setActiveDay(day)}
        >
          {formatDay(day)}
        </button>
      ))}
    </div>
  );
};

const ScheduleItems = ({ items }) => {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">Nothing scheduled for this day yet.</p>;
  }

  // A stable key per item, so a favorite doesn't jump to a different item
  // when switching days (index keys would reuse the same component state)
  return (
    <div className="flex flex-col space-y-4">
      {items.map((item) => (
        <ScheduleItem key={`${item.date}-${item.time}-${item.activity}`} item={item} />
      ))}
    </div>
  );
};

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