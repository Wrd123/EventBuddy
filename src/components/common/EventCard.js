import React from 'react';
import { ChevronRight } from 'lucide-react';
import EventArt from './EventArt';
import AvatarStack from './AvatarStack';
import { formatDateRange } from '../../utils/dates';

// status: 'upcoming' | 'ongoing' | 'past' (from getEventStatus)
const EventCard = ({ event, status, onSelect }) => (
  <button
    onClick={onSelect}
    className={`card w-full p-3 flex items-center text-left ${status === 'past' ? 'opacity-75' : ''}`}
  >
    <div className="w-24 h-20 rounded-xl overflow-hidden shrink-0 mr-3">
      <EventArt type={event.type} seed={event._id} className="w-full h-full" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-start justify-between">
        <div className="font-semibold truncate">{event.name}</div>
        {status === 'ongoing' && (
          <span className="ml-2 shrink-0 bg-go/15 text-go text-xs font-semibold px-2 py-0.5 rounded-full">
            Happening now
          </span>
        )}
      </div>
      <div className="text-sm text-muted mb-1.5 truncate">
        {[formatDateRange(event.startDate, event.endDate), event.location].filter(Boolean).join(' • ')}
      </div>
      <div className="flex items-center">
        <div className="mr-2">
          <AvatarStack members={event.members} />
        </div>
        <div className="text-xs text-muted">{event.members.length} attending</div>
      </div>
    </div>
    <ChevronRight size={20} className="text-muted shrink-0 ml-1" aria-hidden="true" />
  </button>
);

export default EventCard;
