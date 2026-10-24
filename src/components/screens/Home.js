import React, { useState } from 'react';
import { ChevronRight, MapPin, Music2, Navigation, Zap } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { useLocation } from '../../hooks/useLocation';
import Header from '../common/Header';
import Footer from '../layout/Footer';
import LocationPermissionModal from '../common/LocationPermissionModal';
import { AvatarStack, EventArt, EventCard, SuggestedEventCard } from '../common';
import { todayISO, getEventStatus, parseISODate } from '../../utils/dates';

const byStartDate = (a, b) => a.startDate.localeCompare(b.startDate);

// Lists show this many until "View all" is tapped
const PREVIEW_COUNT = 3;

const Home = () => {
  const { events, suggestedEvents, currentUser } = useAppContext();
  const navigate = useNavigate();
  const openEvent = (event) => navigate(`/events/${event._id}`);
  const { isLoadingLocation, hasLocation, requestLocation, getLocationString, isLocationAvailable } = useLocation();
  const [showLocationModal, setShowLocationModal] = useState(false);

  // Upcoming and in-progress events soonest first; past events most recent first
  const today = todayISO();
  const withStatus = events.map(event => ({ event, status: getEventStatus(event, today) }));
  const activeEvents = withStatus
    .filter(({ status }) => status !== 'past')
    .sort((a, b) => byStartDate(a.event, b.event));
  const pastEvents = withStatus
    .filter(({ status }) => status === 'past')
    .sort((a, b) => byStartDate(b.event, a.event));
  const nextUp = activeEvents[0];

  const handleRequestLocation = async () => {
    try {
      await requestLocation();
      setShowLocationModal(false);
    } catch (error) {
      console.error('Failed to get location:', error);
    }
  };

  const firstName = currentUser?.name?.split(' ')[0];

  return (
    <div className="flex flex-col h-full">
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
          <p className="text-muted mt-1">
            You have {activeEvents.length} upcoming event{activeEvents.length === 1 ? '' : 's'}
          </p>
        </section>

        <div className="flex items-center justify-between rounded-2xl bg-surface/80 border border-line backdrop-blur px-3 py-2.5 mb-4">
          <span className="flex items-center font-semibold min-w-0">
            <MapPin size={20} className="mr-2 text-violet-soft shrink-0" aria-hidden="true" />
            <span className="truncate">Near {getLocationString()}</span>
          </span>
          {hasLocation ? (
            <span className="flex items-center text-sm font-semibold text-go bg-go/10 border border-go/30 px-3 py-1 rounded-full shrink-0">
              <Navigation size={14} className="mr-1.5" aria-hidden="true" />
              Location On
            </span>
          ) : isLocationAvailable && (
            <button
              onClick={() => setShowLocationModal(true)}
              className="flex items-center text-sm font-semibold text-violet-soft bg-violet/10 border border-violet/30 px-3 py-1 rounded-full shrink-0"
            >
              <Navigation size={14} className="mr-1.5" aria-hidden="true" />
              Turn on location
            </button>
          )}
        </div>

        {nextUp && <NextUpCard event={nextUp.event} status={nextUp.status} onOpen={() => openEvent(nextUp.event)} />}

        <EventSection
          title="Your Events"
          items={activeEvents}
          onOpen={openEvent}
          empty={
            <div className="card p-5 text-center">
              <p className="font-semibold mb-1">No upcoming events yet</p>
              <p className="text-sm text-muted">Tap + to plan something and invite your friends.</p>
            </div>
          }
        />

        {pastEvents.length > 0 && <EventSection title="Past Events" items={pastEvents} onOpen={openEvent} />}

        {suggestedEvents.length > 0 && (
          <section className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-bold">Suggested For You</h3>
              <Link to="/discover" className="flex items-center text-sm font-semibold text-violet-soft">
                View all <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="flex overflow-x-auto no-scrollbar space-x-3 -mx-4 px-4 pb-1">
              {suggestedEvents.map((event) => (
                <SuggestedEventCard key={event._id} event={event} />
              ))}
            </div>
          </section>
        )}
        </div>
      </div>

      <LocationPermissionModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onRequestLocation={handleRequestLocation}
        isLoading={isLoadingLocation}
      />

      <Footer />
    </div>
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

// Calendar-style badge: NOV / 13 / – 15
const DateBadge = ({ startDate, endDate }) => {
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(start).toUpperCase();
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();

  return (
    <div className="bg-white/95 text-night rounded-xl px-3 py-1.5 text-center shadow-lg min-w-[3.5rem]">
      <div className="text-xs font-bold text-violet-deep">{month}</div>
      <div className="text-2xl font-extrabold leading-none">{start.getDate()}</div>
      {startDate !== endDate && (
        <div className="text-xs font-bold text-violet-deep">
          – {sameMonth ? end.getDate() : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(end)}
        </div>
      )}
    </div>
  );
};

// The soonest upcoming (or happening) event, as a large cover card
const NextUpCard = ({ event, status, onOpen }) => (
  <button
    onClick={onOpen}
    className="relative block w-full h-60 rounded-card overflow-hidden border border-violet/40 text-left shadow-glow-sm mb-2"
    aria-label={`Open ${event.name}`}
  >
    <EventArt type={event.type} seed={event._id} className="absolute inset-0 w-full h-full" />
    <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-night/90 via-night/30 to-transparent" />

    <div className="absolute top-3 left-3">
      <DateBadge startDate={event.startDate} endDate={event.endDate} />
    </div>
    <span
      className={`absolute top-3 right-3 flex items-center text-sm font-semibold px-3 py-1 rounded-full text-white ${
        status === 'ongoing' ? 'bg-emerald-500/90' : 'bg-violet/90 shadow-glow-sm'
      }`}
    >
      <Zap size={14} className="mr-1" aria-hidden="true" />
      {status === 'ongoing' ? 'Happening now' : 'Next up'}
    </span>

    <div className="absolute bottom-3 left-4 right-4">
      <div className="text-3xl font-extrabold tracking-tight text-white truncate">{event.name}</div>
      {event.location && (
        <div className="flex items-center text-white/90 mt-0.5 mb-2">
          <MapPin size={16} className="mr-1.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{event.location}</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center bg-black/35 backdrop-blur rounded-full pl-1 pr-3 py-1">
          <AvatarStack members={event.members} size="md" />
          <span className="ml-2 text-sm text-white">{event.members.length} attending</span>
        </div>
        <span className="w-10 h-10 rounded-full border border-violet-soft/60 bg-night/40 flex items-center justify-center text-white">
          <ChevronRight size={20} aria-hidden="true" />
        </span>
      </div>
    </div>
  </button>
);

// A titled list of event cards that previews the first few
const EventSection = ({ title, items, onOpen, empty = null }) => {
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
      {items.length === 0 ? empty : (
        <div className="flex flex-col space-y-3">
          {visible.map(({ event, status }) => (
            <EventCard key={event._id} event={event} status={status} onSelect={() => onOpen(event)} />
          ))}
        </div>
      )}
    </section>
  );
};

export default Home;
