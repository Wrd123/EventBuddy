import React, { useState } from 'react';
import { Calendar, ExternalLink, MapPin, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from './Button';
import EventCover from './EventCover';
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
// it with friends in EventBuddy, or buy tickets. The parent must be
// position: relative.
const LocalEventSheet = ({ event, onClose }) => {
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
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black bg-opacity-50" role="dialog" aria-modal="true" aria-labelledby="local-event-title">
      <div className="bg-surface border-t border-line rounded-t-3xl overflow-hidden">
        <div className="relative h-36">
          <EventCover imageUrl={event.imageUrl} type={event.type} seed={event._id} className="absolute inset-0 w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full bg-night/60 text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-4 pb-4 -mt-6 relative">
          <h2 id="local-event-title" className="text-2xl font-extrabold tracking-tight mb-3">{event.name}</h2>
          <div className="space-y-2 text-fg/90 mb-4">
            <div className="flex items-start">
              <Calendar size={18} className="mr-2 mt-0.5 text-violet-soft shrink-0" aria-hidden="true" />
              {whenText(event)}
            </div>
            <div className="flex items-start">
              <MapPin size={18} className="mr-2 mt-0.5 text-violet-soft shrink-0" aria-hidden="true" />
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
      </div>
    </div>
  );
};

export default LocalEventSheet;
