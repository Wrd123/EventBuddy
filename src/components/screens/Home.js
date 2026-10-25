import React, { useState } from 'react';
import { ChevronRight, MapPin, Navigation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { usePlace } from '../../hooks/usePlace';
import { useNearbyEvents } from '../../hooks/useNearbyEvents';
import Header from '../common/Header';
import Footer, { TAB_BAR_CLEARANCE } from '../layout/Footer';
import { AvatarStack, EventCard, EventCover, LocalEventSheet, PhotoBackdrop, PlaceSheet, SuggestedEventCard } from '../common';
import { todayISO, getEventStatus, formatDay, daysAwayLabel } from '../../utils/dates';

const byStartDate = (a, b) => a.startDate.localeCompare(b.startDate);

// Past events show this many until "View all" is tapped
const PREVIEW_COUNT = 3;
// Local suggestions shown on Home; Discover has the full list
const SUGGESTION_COUNT = 8;

// "Sunday afternoon"
const dayPart = (now = new Date()) => {
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const hour = now.getHours();
  const part = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  return `${weekday} ${part}`;
};

// One line on what's next: "Picnic in the Park is on." or "19 days until
// Hiking Trip."
const headline = (nextUp, today) => {
  if (!nextUp) return "what's the plan?";
  const { event, status } = nextUp;
  if (status === 'ongoing') return `${event.name} is on.`;
  const away = daysAwayLabel(event.startDate, today);
  return away === 'Tomorrow' ? `${event.name} is tomorrow.` : `${away} until ${event.name}.`;
};

// Home is a timeline: what's on now (or next) as a big photo card, then
// everything after it, each marked with how far off it is. The screen is
// lit by that first event's photo.
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
  const [nextUp, ...laterEvents] = activeEvents;

  const firstName = currentUser?.name?.split(' ')[0];

  return (
    <div className="flex flex-col h-full relative">
      <PhotoBackdrop event={nextUp?.event} />

      <div className={`relative flex-1 overflow-y-auto ${TAB_BAR_CLEARANCE}`}>
        <Header title="EventBuddy" />
        <div className="px-4">
          <section className="pt-1 pb-5">
            <p className="text-[15px] text-fg/70">{dayPart()}</p>
            <h2 className="text-[30px] leading-[1.08] font-bold tracking-[-0.035em] mt-1">
              {firstName ? `Hey ${firstName}` : 'Hey there'}
              {eventsStatus === 'ready' ? `, ${headline(nextUp, today)}` : '.'}
            </h2>
          </section>

          {nextUp ? (
            <Timeline nextUp={nextUp} later={laterEvents} today={today} onOpen={openEvent} />
          ) : (
            <NoEvents status={eventsStatus} onRetry={reloadEvents} />
          )}

          {pastEvents.length > 0 && <PastEvents items={pastEvents} onOpen={openEvent} />}

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

// The spine down the left with a marker per event: "Now" for one that's
// on, otherwise how many days off it is
const Timeline = ({ nextUp, later, today, onOpen }) => (
  <div className="relative">
    <span className="absolute left-[27px] top-4 bottom-6 w-px bg-white/15" aria-hidden="true" />

    <TimelineStop marker={<StopMarker status={nextUp.status} label={daysAwayLabel(nextUp.event.startDate, today)} />}>
      <NextUpCard event={nextUp.event} status={nextUp.status} onOpen={() => onOpen(nextUp.event)} />
    </TimelineStop>

    {later.length > 0 && (
      <section aria-labelledby="coming-up" className="mt-6">
        <h2 id="coming-up" className="ml-[68px] mb-3 text-lg font-semibold tracking-[-0.01em]">Coming up</h2>
        <ol className="flex flex-col gap-2.5">
          {later.map(({ event, status }) => (
            <li key={event._id}>
              <TimelineStop marker={<StopMarker status={status} label={daysAwayLabel(event.startDate, today)} />}>
                <EventCard event={event} status={status} onSelect={() => onOpen(event)} />
              </TimelineStop>
            </li>
          ))}
        </ol>
      </section>
    )}
  </div>
);

const TimelineStop = ({ marker, children }) => (
  <div className="flex items-center gap-3">
    <div className="w-14 shrink-0 flex justify-center">{marker}</div>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

// A pill that sits on the spine: glowing green for now, frosted otherwise
const StopMarker = ({ status, label }) =>
  status === 'ongoing' ? (
    <span className="relative px-2.5 py-1 rounded-full bg-go text-night text-xs font-bold shadow-[0_0_16px_rgba(74,222,128,0.55)]">Now</span>
  ) : (
    <span className="relative px-2 py-1 rounded-full bg-night/85 border border-line text-[11px] font-semibold text-fg/85 whitespace-nowrap">{label}</span>
  );

// What goes where the timeline would be, depending on why there isn't
// one: still loading, couldn't load, or no upcoming events
const NoEvents = ({ status, onRetry }) => {
  if (status === 'loading') {
    return <div className="h-[272px] rounded-[30px] card animate-pulse" aria-label="Loading your events" />;
  }
  if (status === 'error') {
    return (
      <div className="card p-5 text-center" role="alert">
        <p className="font-semibold mb-1">Couldn't load your events</p>
        <p className="text-sm text-muted mb-3">Check your connection and try again.</p>
        <button onClick={onRetry} className="text-sm font-semibold text-accent-soft">Try again</button>
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

// The event on now (or next): its photo, with the details on a pane of
// glass so they read on any picture
const NextUpCard = ({ event, status, onOpen }) => (
  <button
    onClick={onOpen}
    className="relative block w-full h-[272px] rounded-[30px] overflow-hidden text-left shadow-float ring-1 ring-white/10 transition-transform duration-200 active:scale-[0.98]"
    aria-label={`Open ${event.name}`}
  >
    <EventCover event={event} width={330} className="absolute inset-0 w-full h-full" />

    <span className="glass absolute top-3.5 left-3.5 flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full text-[13px] font-semibold">
      {status === 'ongoing' ? (
        <>
          <span className="w-2 h-2 rounded-full bg-go shadow-[0_0_0_4px_rgba(74,222,128,0.25),0_0_12px_#4ade80]" />
          Happening now
        </>
      ) : (
        formatDay(event.startDate)
      )}
    </span>

    <span className="glass absolute inset-x-2.5 bottom-2.5 rounded-[22px] px-4 py-3.5 flex flex-col gap-2.5">
      <span className="flex flex-col min-w-0">
        <span className="text-[22px] font-bold tracking-[-0.025em] truncate">{event.name}</span>
        {event.location && <span className="text-sm text-fg/75 truncate">{event.location}</span>}
      </span>
      <span className="flex items-center justify-between">
        <span className="flex items-center gap-2.5">
          <AvatarStack members={event.members} />
          <span className="text-[13px] font-medium text-fg/85">{event.members.length} going</span>
        </span>
        <span className="w-9 h-9 rounded-full bg-fg text-night flex items-center justify-center">
          <ChevronRight size={18} strokeWidth={2.4} aria-hidden="true" />
        </span>
      </span>
    </span>
  </button>
);

// Earlier events, most recent first, previewing the first few
const PastEvents = ({ items, onOpen }) => {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, PREVIEW_COUNT);

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Past events</h2>
        {items.length > PREVIEW_COUNT && (
          <button onClick={() => setShowAll(prev => !prev)} className="flex items-center text-sm font-medium text-fg/70">
            {showAll ? 'Show less' : 'View all'} <ChevronRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {visible.map(({ event, status }) => (
          <EventCard key={event._id} event={event} status={status} onSelect={() => onOpen(event)} />
        ))}
      </div>
    </section>
  );
};

// Real events near you, a tap away from planning with friends. While the
// phone's location is on its way they show as loading; if it can't be had,
// a card offers to choose a place instead.
const Suggestions = ({ place, locating, nearby, onChoosePlace, onOpen }) => {
  // Errors and empty areas are explained on Discover; Home just stays quiet
  if (place && (nearby.status === 'error' || (nearby.status === 'ready' && nearby.events.length === 0))) return null;

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Suggested for you</h2>
        {place && (
          <button
            onClick={onChoosePlace}
            aria-label={`Change location, now near ${place.label}`}
            className="glass flex items-center gap-1.5 max-w-[55%] pl-2.5 pr-3 py-1.5 rounded-full text-[13px] font-medium"
          >
            {place.source === 'device'
              ? <Navigation size={13} className="text-go shrink-0" aria-hidden="true" />
              : <MapPin size={13} className="text-accent-soft shrink-0" aria-hidden="true" />}
            <span className="truncate">{place.label}</span>
          </button>
        )}
      </div>
      {!place && !locating ? (
        <button onClick={onChoosePlace} className="card w-full p-4 text-left">
          <span className="font-semibold block">Find concerts, games and shows near you</span>
          <span className="flex items-center text-sm text-accent-soft mt-0.5">
            <Navigation size={14} className="mr-1.5" aria-hidden="true" />
            Choose a location
          </span>
        </button>
      ) : !place || nearby.status === 'loading' ? (
        <div className="flex space-x-3 overflow-hidden" aria-label="Loading suggestions">
          {[0, 1, 2].map(i => <div key={i} className="w-40 h-32 rounded-2xl card animate-pulse shrink-0" />)}
        </div>
      ) : (
        <div className="flex overflow-x-auto no-scrollbar space-x-3 -mx-4 px-4 pb-1 snap-x snap-mandatory scroll-px-4">
          {nearby.events.slice(0, SUGGESTION_COUNT).map((event) => (
            <SuggestedEventCard key={event._id} event={event} onOpen={() => onOpen(event)} />
          ))}
        </div>
      )}
    </section>
  );
};

export default Home;
