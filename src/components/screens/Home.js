import React, { useState } from 'react';
import { ChevronRight, MapPin, Music2, Navigation, Zap } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { usePlace } from '../../hooks/usePlace';
import { useNearbyEvents } from '../../hooks/useNearbyEvents';
import Header from '../common/Header';
import Footer from '../layout/Footer';
import { AvatarStack, EventCard, EventCover, LocalEventSheet, PlaceSheet, SuggestedEventCard } from '../common';
import { todayISO, getEventStatus, formatDateRange } from '../../utils/dates';

const byStartDate = (a, b) => a.startDate.localeCompare(b.startDate);

// Lists show this many until "View all" is tapped
const PREVIEW_COUNT = 3;
// Local suggestions shown on Home; Discover has the full list
const SUGGESTION_COUNT = 8;

const Home = () => {
  const { events, eventsStatus, reloadEvents, currentUser } = useAppContext();
  const navigate = useNavigate();
  const openEvent = (event) => navigate(`/events/${event._id}`);
  const { place, locationError } = usePlace();
  const nearby = useNearbyEvents(place);
  const [choosingPlace, setChoosingPlace] = useState(false);
  const [openSuggestion, setOpenSuggestion] = useState(null);

  // Upcoming and in-progress events soonest first; past events most recent first
  const today = todayISO();
  const withStatus = events.map(event => ({ event, status: getEventStatus(event, today) }));
  const activeEvents = withStatus
    .filter(({ status }) => status !== 'past')
    .sort((a, b) => byStartDate(a.event, b.event));
  const pastEvents = withStatus
    .filter(({ status }) => status === 'past')
    .sort((a, b) => byStartDate(b.event, a.event));
  // The soonest one gets the big card; the list holds the rest
  const [nextUp, ...laterEvents] = activeEvents;

  const firstName = currentUser?.name?.split(' ')[0];

  return (
    <div className="flex flex-col h-full relative">
      {/* The header and mountain backdrop scroll away with the page; only
          the tab bar stays put */}
      <div className="relative flex-1 overflow-y-auto pb-4">
        <Backdrop />
        <Header title="EventBuddy" />
        <div className="relative px-4">
        <section className="pt-2 pb-4">
          <h2 className="text-3xl font-extrabold tracking-tight flex items-center">
            {firstName ? `Hey ${firstName}!` : 'Welcome!'}
            <Music2 size={26} className="ml-2 text-violet-soft" aria-hidden="true" />
          </h2>
          {eventsStatus === 'ready' && (
            <p className="text-muted mt-1">
              You have {activeEvents.length} upcoming event{activeEvents.length === 1 ? '' : 's'}
            </p>
          )}
        </section>

        {/* Without a place, Suggestions below asks for one instead */}
        {place && <PlaceBar place={place} onChange={() => setChoosingPlace(true)} />}

        {nextUp && <NextUpCard event={nextUp.event} status={nextUp.status} onOpen={() => openEvent(nextUp.event)} />}

        {!nextUp && <NoEvents status={eventsStatus} onRetry={reloadEvents} />}

        {laterEvents.length > 0 && <EventSection title="Coming up" items={laterEvents} onOpen={openEvent} />}

        {pastEvents.length > 0 && <EventSection title="Past events" items={pastEvents} onOpen={openEvent} />}

        <Suggestions
          place={place}
          locating={!place && !locationError}
          nearby={nearby}
          onChoosePlace={() => setChoosingPlace(true)}
          onOpen={setOpenSuggestion}
        />
        </div>
      </div>

      {choosingPlace && <PlaceSheet onClose={() => setChoosingPlace(false)} />}
      {openSuggestion && <LocalEventSheet event={openSuggestion} onClose={() => setOpenSuggestion(null)} />}

      <Footer />
    </div>
  );
};

// What goes where the Next up card would be, depending on why there isn't
// one: still loading, couldn't load, or no upcoming events
const NoEvents = ({ status, onRetry }) => {
  if (status === 'loading') {
    return <div className="h-60 rounded-card bg-surface border border-line animate-pulse" aria-label="Loading your events" />;
  }
  if (status === 'error') {
    return (
      <div className="card p-5 text-center" role="alert">
        <p className="font-semibold mb-1">Couldn't load your events</p>
        <p className="text-sm text-muted mb-3">Check your connection and try again.</p>
        <button onClick={onRetry} className="text-sm font-semibold text-violet-soft">Try again</button>
      </div>
    );
  }
  return (
    <div className="card p-5 text-center">
      <p className="font-semibold mb-1">No upcoming events yet</p>
      <p className="text-sm text-muted">Tap + to plan something and invite your friends.</p>
    </div>
  );
};

// Where suggestions come from, and a way to change it
const PlaceBar = ({ place, onChange }) => (
  <button
    onClick={onChange}
    aria-label={`Change location, now near ${place.label}`}
    className="w-full flex items-center justify-between rounded-2xl bg-surface/80 border border-line backdrop-blur px-3 py-2.5 mb-4 text-left"
  >
    <span className="flex items-center font-semibold min-w-0">
      <MapPin size={20} className="mr-2 text-violet-soft shrink-0" aria-hidden="true" />
      <span className="truncate">Near {place.label}</span>
    </span>
    {place.source === 'device' ? (
      <span className="flex items-center text-sm font-semibold text-go bg-go/10 border border-go/30 px-3 py-1 rounded-full shrink-0">
        <Navigation size={14} className="mr-1.5" aria-hidden="true" />
        Location on
      </span>
    ) : (
      <span className="flex items-center text-sm font-semibold text-violet-soft bg-violet/10 border border-violet/30 px-3 py-1 rounded-full shrink-0">
        <Navigation size={14} className="mr-1.5" aria-hidden="true" />
        Change
      </span>
    )}
  </button>
);

// Real events near you, a tap away from planning with friends. While the
// phone's location is on its way they show as loading; if it can't be had,
// a card offers to choose a place instead.
const Suggestions = ({ place, locating, nearby, onChoosePlace, onOpen }) => {
  // Errors and empty areas are explained on Discover; Home just stays quiet
  if (place && (nearby.status === 'error' || (nearby.status === 'ready' && nearby.events.length === 0))) return null;

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xl font-bold">Suggested for you</h3>
        {place && (
          <Link to="/discover" className="flex items-center text-sm font-semibold text-violet-soft">
            View all <ChevronRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
      {!place && !locating ? (
        <button onClick={onChoosePlace} className="card w-full p-4 text-left">
          <span className="font-semibold block">Find concerts, games and shows near you</span>
          <span className="flex items-center text-sm text-violet-soft mt-0.5">
            <Navigation size={14} className="mr-1.5" aria-hidden="true" />
            Choose a location
          </span>
        </button>
      ) : !place || nearby.status === 'loading' ? (
        <div className="flex space-x-3 overflow-hidden" aria-label="Loading suggestions">
          {[0, 1, 2].map(i => <div key={i} className="w-40 h-32 rounded-2xl bg-surface border border-line animate-pulse shrink-0" />)}
        </div>
      ) : (
        <div className="flex overflow-x-auto no-scrollbar space-x-3 -mx-4 px-4 pb-1">
          {nearby.events.slice(0, SUGGESTION_COUNT).map((event) => (
            <SuggestedEventCard key={event._id} event={event} onOpen={() => onOpen(event)} />
          ))}
        </div>
      )}
    </section>
  );
};

// Soft violet mountains behind the header and greeting, fading into the
// night background
const Backdrop = () => (
  <div className="absolute inset-x-0 top-0 h-72 pointer-events-none overflow-hidden" aria-hidden="true">
    <svg viewBox="0 0 400 280" preserveAspectRatio="xMidYMax slice" className="w-full h-full">
      <defs>
        <radialGradient id="home-glow" cx="0.75" cy="0.15" r="0.7">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.55" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="home-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#0c0a1f" stopOpacity="0" />
          <stop offset="1" stopColor="#0c0a1f" stopOpacity="1" />
        </linearGradient>
      </defs>
      <rect width="400" height="280" fill="url(#home-glow)" />
      <path d="M0 170 L70 110 L120 140 L190 70 L250 130 L300 95 L400 150 V280 H0 Z" fill="#3b2470" opacity="0.6" />
      <path d="M0 200 L60 160 L130 190 L210 130 L280 180 L340 150 L400 185 V280 H0 Z" fill="#24164a" opacity="0.85" />
      <rect width="400" height="280" fill="url(#home-fade)" />
    </svg>
  </div>
);

// The soonest upcoming (or happening) event: a big photo with the details
// underneath, so the name reads cleanly whatever the picture
const NextUpCard = ({ event, status, onOpen }) => (
  <button
    onClick={onOpen}
    className="card block w-full overflow-hidden text-left shadow-glow-sm mb-2"
    aria-label={`Open ${event.name}`}
  >
    <div className="relative h-48">
      <EventCover event={event} width={360} className="absolute inset-0 w-full h-full" />
      <span
        className={`absolute top-3 left-3 flex items-center text-sm font-semibold px-3 py-1 rounded-full text-white ${
          status === 'ongoing' ? 'bg-emerald-500/90' : 'bg-violet/90 shadow-glow-sm'
        }`}
      >
        <Zap size={14} className="mr-1" aria-hidden="true" />
        {status === 'ongoing' ? 'Happening now' : 'Next up'}
      </span>
    </div>

    <div className="p-4">
      <div className="text-2xl font-extrabold tracking-tight truncate">{event.name}</div>
      <div className="font-semibold text-violet-soft">{formatDateRange(event.startDate, event.endDate)}</div>
      {event.location && (
        <div className="flex items-center text-muted">
          <MapPin size={15} className="mr-1.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{event.location}</span>
        </div>
      )}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center">
          <AvatarStack members={event.members} size="md" />
          <span className="ml-2 text-sm text-muted">{event.members.length} attending</span>
        </div>
        <ChevronRight size={22} className="text-muted" aria-hidden="true" />
      </div>
    </div>
  </button>
);

// A titled list of event cards that previews the first few
const EventSection = ({ title, items, onOpen }) => {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, PREVIEW_COUNT);

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xl font-bold">{title}</h3>
        {items.length > PREVIEW_COUNT && (
          <button onClick={() => setShowAll(prev => !prev)} className="flex items-center text-sm font-semibold text-violet-soft">
            {showAll ? 'Show less' : 'View all'} <ChevronRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="flex flex-col space-y-3">
        {visible.map(({ event, status }) => (
          <EventCard key={event._id} event={event} status={status} onSelect={() => onOpen(event)} />
        ))}
      </div>
    </section>
  );
};

export default Home;
