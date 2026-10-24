import React, { useState } from 'react';
import { Calendar, MessageSquare, DollarSign, Map, Plus } from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Header from '../common/Header';
import { Avatar, EventArt, ScreenLoader } from '../common';
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
  <div className="relative mx-4 h-52 rounded-card overflow-hidden border border-violet/40 shadow-glow-sm">
    <EventArt type={event.type} seed={event._id} className="absolute inset-0 w-full h-full" />
    <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-night/90 via-night/30 to-transparent" />
    <div className="absolute bottom-3 left-4 right-4">
      <h2 className="text-white text-2xl font-extrabold tracking-tight">{event.name}</h2>
      <p className="text-white/90">{[formatDateRange(event.startDate, event.endDate), event.location].filter(Boolean).join(' • ')}</p>
    </div>
  </div>
);

const EventActions = ({ eventId }) => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-4 gap-2 px-4 pt-4">
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
    className="card flex flex-col items-center py-3 text-fg/90"
  >
    <Icon size={20} className="text-violet-soft" />
    <span className="text-xs mt-1.5 font-medium">{label}</span>
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
      <h3 className="text-xl font-bold mb-3">Group Members</h3>
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
          <div className="w-8 h-8 bg-violet/15 rounded-full flex items-center justify-center text-violet-soft border border-dashed border-violet/40">
            <Plus size={16} />
          </div>
          <span className="text-xs mt-1">Invite</span>
        </button>
      </div>
    
      <h3 className="text-xl font-bold mb-3">{heading}</h3>
      {items.length > 0 ? (
        <div className="flex flex-col space-y-3">
          {items.map((item) => (
            <ScheduleItem key={item._id} item={item} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Nothing scheduled for this day yet.</p>
      )}
    </div>
  );
};

const ScheduleItem = ({ item }) => (
  <div className="card p-3">
    <div className="flex justify-between items-start">
      <div>
        <div className="text-sm text-muted">{formatTimeRange(item.startTime, item.endTime)}</div>
        <div className="font-semibold">{item.activity}</div>
        <div className="text-sm text-muted">{item.location}</div>
      </div>
      <div className="chip shrink-0 ml-2">
        {item.attendees.length} going
      </div>
    </div>
  </div>
);

export default EventDetails;