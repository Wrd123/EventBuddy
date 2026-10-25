import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import EventCover from './EventCover';
import { whenText } from './LocalEventSheet';

// Suggestions you've hearted, remembered on this device only. Storage can be
// unavailable, e.g. in private browsing.
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

// onOpen: tapping the card (not the heart) shows the event's details
const SuggestedEventCard = ({ event, onOpen }) => {
  const [isSaved, setIsSaved] = useState(() => readSaved().has(event._id));

  const toggle = () => {
    const saved = readSaved();
    if (saved.has(event._id)) saved.delete(event._id);
    else saved.add(event._id);
    writeSaved(saved);
    setIsSaved(saved.has(event._id));
  };

  // Photo on top and the details underneath, so the text never fights the
  // picture for contrast
  return (
    <div className="relative flex-shrink-0 w-40 snap-start">
      <button onClick={onOpen} className="block w-full text-left transition-transform duration-200 active:scale-[0.97]" aria-label={`See ${event.name}`}>
        <span className="block h-32 rounded-[20px] overflow-hidden ring-1 ring-white/10">
          <EventCover event={event} width={160} className="w-full h-full" />
        </span>
        <span className="block mt-2 font-bold text-sm truncate">{event.name}</span>
        <span className="block text-xs font-medium text-accent-soft truncate">{whenText(event)}</span>
        <span className="block text-xs text-fg/60 truncate">{event.venue || event.location}</span>
      </button>
      <button
        onClick={toggle}
        aria-pressed={isSaved}
        aria-label={isSaved ? `Unsave ${event.name}` : `Save ${event.name}`}
        className="glass absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-white transition-transform active:scale-90"
      >
        <Heart size={16} className={isSaved ? 'fill-accent text-accent' : ''} />
      </button>
    </div>
  );
};

export default SuggestedEventCard;
