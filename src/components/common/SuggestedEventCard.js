import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import EventArt from './EventArt';
import { formatDateRange } from '../../utils/dates';

// Suggestions you've hearted, remembered on this device only (discovery has
// no backend yet). Storage can be unavailable, e.g. in private browsing.
const SAVED_KEY = 'eventbuddy_saved_suggestions';

const readSaved = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SAVED_KEY)) || []);
  } catch {
    return new Set();
  }
};

const writeSaved = (saved) => {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify([...saved]));
  } catch {
    // Not saved, but the heart still works for this visit
  }
};

const SuggestedEventCard = ({ event }) => {
  const [isSaved, setIsSaved] = useState(() => readSaved().has(event._id));

  const toggle = () => {
    const saved = readSaved();
    if (saved.has(event._id)) saved.delete(event._id);
    else saved.add(event._id);
    writeSaved(saved);
    setIsSaved(saved.has(event._id));
  };

  return (
    <div className="relative flex-shrink-0 w-36 h-32 rounded-2xl overflow-hidden border border-line">
      <EventArt type={event.type} seed={event._id} className="absolute inset-0 w-full h-full" />
      {/* Darkens the bottom so the text stays readable on any cover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      <button
        onClick={toggle}
        aria-pressed={isSaved}
        aria-label={isSaved ? `Unsave ${event.name}` : `Save ${event.name}`}
        className="absolute top-2 right-2 p-1 rounded-full text-white"
      >
        <Heart size={20} className={isSaved ? 'fill-violet-soft text-violet-soft' : ''} />
      </button>
      <div className="absolute bottom-2 left-3 right-3">
        <div className="font-bold text-sm text-white truncate">{event.name}</div>
        <div className="text-xs text-white/80 truncate">{formatDateRange(event.startDate, event.endDate)}</div>
      </div>
    </div>
  );
};

export default SuggestedEventCard;
