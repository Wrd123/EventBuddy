import React, { useState } from 'react';
import { Calendar, MessageSquare, DollarSign, Map, Plus } from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Header from '../common/Header';
import { Avatar, ScreenLoader } from '../common';
import NotFound from './NotFound';
import InviteSheet from '../common/InviteSheet';
import { useAppContext } from '../../context/AppContext';
import { useEvent } from '../../hooks/useEvent';
import { formatDateRange, formatDay, getEventStatus, defaultScheduleDay } from '../../utils/dates';
import { formatTimeRange, sortSchedule } from '../../utils/schedule';

const EventDetails = () => {
  const { eventId } = useParams();
  const { event, status, error } = useEvent(eventId);
  const { currentUser } = useAppContext();
  // Create Event sends new organizers here with the invite sheet open
  const location = useLocation();
  const [showInvite, setShowInvite] = useState(Boolean(location.state?.showInvite));

  if (status === 'loading') return <ScreenLoader />;
  if (status === 'not-found') {
    return <NotFound title="Event not found" message="This event doesn't exist or was deleted." />;
  }
  if (status === 'error') {
    return <NotFound title="Couldn't load event" message={error} />;
  }

  return (
    <div className="flex flex-col h-full relative">
      <Header 
        title={event.name} 
        type="screen" 
        showBack={true} 
        showProfile={false} 
        showNotifications={false}
      />
      
      <div className="flex-1 overflow-y-auto pb-16">
        <EventCover event={event} />
        <EventActions eventId={eventId} />
        <EventContent event={event} onInvite={() => setShowInvite(true)} />
      </div>

      {showInvite && (
        <InviteSheet
          event={event}
          isOrganizer={event.createdBy === currentUser?._id}
          onClose={() => setShowInvite(false)}
        />
      )}
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
      <p className="text-white">{[formatDateRange(event.startDate, event.endDate), event.location].filter(Boolean).join(' • ')}</p>
    </div>
  </div>
);

const EventActions = ({ eventId }) => {
  const navigate = useNavigate();

  return (
    <div className="flex justify-around p-3 bg-white border-b border-gray-200">
      <ActionButton 
        Icon={Calendar} 
        label="Schedule"
        onClick={() => navigate(`/events/${eventId}/schedule`)}
      />
      <ActionButton 
        Icon={MessageSquare} 
        label="Group Chat"
        onClick={() => navigate(`/events/${eventId}/chat`)}
      />
      <ActionButton 
        Icon={DollarSign} 
        label="Expenses"
        onClick={() => navigate(`/events/${eventId}/expenses`)}
      />
      <ActionButton 
        Icon={Map} 
        label="Map"
        onClick={() => navigate('/map')}
      />
    </div>
  );
};

const ActionButton = ({ Icon, label, onClick }) => (
  <button 
    onClick={onClick} 
    className="flex flex-col items-center text-gray-700"
  >
    <Icon size={20} />
    <span className="text-xs mt-1">{label}</span>
  </button>
);

const EventContent = ({ event, onInvite }) => {
  // Preview one day: today while the event is running, else its first day.
  // The Schedule screen shows every day.
  const day = defaultScheduleDay(event);
  const items = sortSchedule(event.schedule.filter(item => item.date === day));
  const heading = getEventStatus(event) === 'ongoing' ? "Today's Schedule" : `Schedule · ${formatDay(day)}`;

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-2">Group Members</h3>
      <div className="flex space-x-2 mb-4 overflow-x-auto no-scrollbar">
        {event.members.map((member) => (
          // shrink-0 so a big group scrolls instead of squashing
          <div key={member._id} className="flex flex-col items-center shrink-0">
            <Avatar 
              initial={member.name.charAt(0)} 
              color={member.color} 
              size="md" 
            />
            <span className="text-xs mt-1">{member.name}</span>
          </div>
        ))}
        <button onClick={onInvite} className="flex flex-col items-center shrink-0">
          <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 border border-dashed border-purple-300">
            <Plus size={16} />
          </div>
          <span className="text-xs mt-1">Invite</span>
        </button>
      </div>
    
      <h3 className="text-lg font-semibold mb-2">{heading}</h3>
      {items.length > 0 ? (
        <div className="flex flex-col space-y-3">
          {items.map((item) => (
            <ScheduleItem key={item._id} item={item} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Nothing scheduled for this day yet.</p>
      )}
    </div>
  );
};

const ScheduleItem = ({ item }) => (
  <div className="border border-gray-200 rounded-lg p-3">
    <div className="flex justify-between items-start">
      <div>
        <div className="text-sm text-gray-500">{formatTimeRange(item.startTime, item.endTime)}</div>
        <div className="font-medium">{item.activity}</div>
        <div className="text-sm">{item.location}</div>
      </div>
      <div className="bg-purple-100 text-purple-600 px-2 py-1 rounded text-xs shrink-0 ml-2">
        {item.attendees.length} going
      </div>
    </div>
  </div>
);

export default EventDetails;