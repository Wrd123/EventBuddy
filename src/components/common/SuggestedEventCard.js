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
    <div className="relative flex-shrink-0 w-40">
      <button onClick={onOpen} className="block w-full text-left" aria-label={`See ${event.name}`}>
        <span className="block h-32 rounded-2xl overflow-hidden border border-line">
          <EventCover event={event} width={160} className="w-full h-full" />
        </span>
        <span className="block mt-2 font-bold text-sm truncate">{event.name}</span>
        <span className="block text-xs font-semibold text-violet-soft truncate">{whenText(event)}</span>
        <span className="block text-xs text-muted truncate">{event.venue || event.location}</span>
      </button>
      <button
        onClick={toggle}
        aria-pressed={isSaved}
        aria-label={isSaved ? `Unsave ${event.name}` : `Save ${event.name}`}
        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/45 backdrop-blur flex items-center justify-center text-white"
      >
        <Heart size={18} className={isSaved ? 'fill-violet-soft text-violet-soft' : ''} />
      </button>
    </div>
  );
};

export default SuggestedEventCard;
