import React from 'react';
import { ChevronRight } from 'lucide-react';
import EventCover from './EventCover';
import { formatDateRangeShort } from '../../utils/dates';

// A row for one of your events on a pane of glass: photo, name, when and
// where. status: 'upcoming' | 'ongoing' | 'past' (from getEventStatus)
const EventCard = ({ event, status, onSelect }) => (
  <button
    onClick={onSelect}
    className={`card w-full p-2 pr-3 flex items-center gap-3.5 text-left rounded-[22px] transition-transform duration-200 active:scale-[0.98] ${
      status === 'past' ? 'opacity-70' : ''
    }`}
  >
    {/* The "Happening now" badge sits on the picture so the name keeps the full width */}
    <div className="relative w-[54px] h-[54px] rounded-2xl overflow-hidden shrink-0">
      <EventCover event={event} width={54} className="w-full h-full" />
      {status === 'ongoing' && (
        <span className="absolute inset-x-1 bottom-1 bg-go text-night text-[9px] font-bold text-center py-0.5 rounded-full">
          Happening now
        </span>
      )}
    </div>
    <div className="flex-1 min-w-0">
      <div className="font-semibold line-clamp-2">{event.name}</div>
      <div className="text-[13px] text-fg/65 truncate">
        {[formatDateRangeShort(event.startDate, event.endDate), event.location].filter(Boolean).join(', ')}
      </div>
    </div>
    <ChevronRight size={18} className="text-fg/40 shrink-0" aria-hidden="true" />
  </button>
);

export default EventCard;
