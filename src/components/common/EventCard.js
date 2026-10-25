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
    {/* The "Happening now" badge sits on the picture so the name keeps the full width */}
    <div className="relative w-24 h-20 rounded-xl overflow-hidden shrink-0 mr-3">
      <EventArt type={event.type} seed={event._id} className="w-full h-full" />
      {status === 'ongoing' && (
        <span className="absolute left-1.5 bottom-1.5 bg-emerald-500/90 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
          Happening now
        </span>
      )}
    </div>
    <div className="flex-1 min-w-0">
      <div className="font-semibold truncate">{event.name}</div>
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
