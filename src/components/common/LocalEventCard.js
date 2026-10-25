import React from 'react';
import { ChevronRight } from 'lucide-react';
import EventCover from './EventCover';
import { whenText, whereText } from './LocalEventSheet';

// A row in Discover's local events list
const LocalEventCard = ({ event, onOpen }) => (
  <button onClick={onOpen} className="card w-full p-3 flex items-center text-left">
    <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 mr-3">
      <EventCover event={event} width={80} className="w-full h-full" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="font-semibold line-clamp-2">{event.name}</div>
      <div className="text-sm text-accent-soft mt-0.5">{whenText(event)}</div>
      <div className="text-sm text-muted truncate">{whereText(event)}</div>
    </div>
    <ChevronRight size={20} className="text-muted shrink-0 ml-1" aria-hidden="true" />
  </button>
);

export default LocalEventCard;
