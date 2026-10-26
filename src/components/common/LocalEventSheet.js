import React, { useState } from 'react';
import { Calendar, ExternalLink, MapPin, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from './Button';
import EventCover from './EventCover';
import Sheet, { useSheet } from './Sheet';
import { useAppContext } from '../../context/AppContext';
import { formatDateRange } from '../../utils/dates';
import { formatTime } from '../../utils/schedule';

// "Fri, Nov 20, 2099 • 7:30 PM"
export const whenText = (event) =>
  [formatDateRange(event.startDate, event.endDate), formatTime(event.startTime)].filter(Boolean).join(' • ');

// "State Farm Arena • Atlanta, GA • 4.3 mi"
export const whereText = (event) =>
  [event.venue, event.location, event.distanceMiles != null ? `${event.distanceMiles} mi` : '']
    .filter(Boolean)
    .join(' • ');

// An EventBuddy event's name is at most 60 characters
const MAX_NAME_LENGTH = 60;
const shortName = (name) => (name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 1).trimEnd()}…` : name);

// Details for a local (Ticketmaster) event, with the two next steps: plan
// it with friends in EventBuddy, or buy tickets.
const LocalEventSheet = ({ event, onClose }) => (
  // The photo is the header, so it drags the sheet like the default one
  <Sheet
    onClose={onClose}
    className="overflow-hidden"
    header={({ close }) => (
      <div className="relative h-36">
        <EventCover event={event} className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
        <div className="absolute top-2 left-1/2 -translate-x-1/2 h-1 w-9 rounded-full bg-white/60" aria-hidden="true" />
        <button type="button" onClick={close} className="absolute top-1 right-1 w-11 h-11 flex items-center justify-center" aria-label="Close">
          <span className="p-1.5 rounded-full bg-night/60 text-white"><X size={18} /></span>
        </button>
      </div>
    )}
  >
    <LocalEventDetails event={event} />
  </Sheet>
);

// Below the photo. The title is in here, so it takes the id the sheet is
// labelled by from the sheet.
const LocalEventDetails = ({ event }) => {
  const { titleId } = useSheet();
  const { createEvent } = useAppContext();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Creates an EventBuddy event from this one and opens its invite sheet,
  // so inviting friends is the very next tap
  const planWithFriends = async () => {
    setError('');
    setIsSaving(true);
    try {
      const { event: created } = await createEvent({
        name: shortName(event.name),
        type: event.type,
        startDate: event.startDate,
        endDate: event.endDate,
        location: [event.venue, event.location].filter(Boolean).join(', '),
        ticketUrl: event.ticketUrl
      });
      navigate(`/events/${created._id}`, { state: { showInvite: true } });
    } catch (err) {
      setError(err.message);
      setIsSaving(false);
    }
  };

  return (
    <div className="px-4 pb-4 -mt-6 relative">
      <h2 id={titleId} className="text-2xl font-extrabold tracking-tight mb-3">{event.name}</h2>
      <div className="space-y-2 text-fg/90 mb-4">
        <div className="flex items-start">
          <Calendar size={18} className="mr-2 mt-0.5 text-accent-soft shrink-0" aria-hidden="true" />
          {whenText(event)}
        </div>
        <div className="flex items-start">
          <MapPin size={18} className="mr-2 mt-0.5 text-accent-soft shrink-0" aria-hidden="true" />
          {whereText(event)}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-3 py-2 rounded-xl mb-3 text-sm" role="alert">{error}</div>
      )}

      <Button onClick={planWithFriends} fullWidth size="lg" disabled={isSaving} icon={<Users size={18} />}>
        {isSaving ? 'Creating event...' : 'Plan with friends'}
      </Button>
      {event.ticketUrl && (
        <a
          href={event.ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 w-full flex items-center justify-center py-3 rounded-xl border border-line text-fg font-semibold"
        >
          Get tickets <ExternalLink size={16} className="ml-2" aria-hidden="true" />
        </a>
      )}
      <p className="text-xs text-faint text-center mt-3">Event details from Ticketmaster</p>
    </div>
  );
};

export default LocalEventSheet;
