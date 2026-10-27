import React, { useState } from 'react';
import { MapPin, Navigation, Search } from 'lucide-react';
import Header from '../common/Header';
import Footer, { TAB_BAR_CLEARANCE } from '../layout/Footer';
import { Button, CitySearch, LocalEventCard, LocalEventSheet, PlaceSheet, Skeleton, SkeletonScreen } from '../common';
import { usePlace } from '../../hooks/usePlace';
import { useNearbyEvents } from '../../hooks/useNearbyEvents';

const CATEGORIES = [
  ['all', 'All'],
  ['music', 'Music'],
  ['sports', 'Sports'],
  ['arts', 'Arts'],
  ['family', 'Family']
];
const RADII = [10, 25, 50, 100];

// Upcoming concerts, games and shows near you (from Ticketmaster), each one
// a tap away from becoming an EventBuddy plan with friends
const Discover = () => {
  const { place, locationError } = usePlace();
  const [category, setCategory] = useState('all');
  const [radius, setRadius] = useState(25);
  const [filter, setFilter] = useState('');
  const [choosingPlace, setChoosingPlace] = useState(false);
  const [openEvent, setOpenEvent] = useState(null);
  const nearby = useNearbyEvents(place, { radius, category });

  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? nearby.events.filter(e => `${e.name} ${e.venue}`.toLowerCase().includes(needle))
    : nearby.events;

  return (
    <div className="flex flex-col h-full relative">
      <Header title="Discover" />

      <div className={`flex-1 overflow-y-auto px-4 ${TAB_BAR_CLEARANCE}`}>
        {!place ? (
          <FirstRun locationError={locationError} />
        ) : (
          <>
            <div className="flex items-center justify-between card rounded-full px-4 py-2.5 mb-3">
              <span className="flex items-center font-semibold min-w-0">
                <MapPin size={20} className="mr-2 text-accent-soft shrink-0" aria-hidden="true" />
                <span className="truncate">Near {place.label}</span>
              </span>
              <button onClick={() => setChoosingPlace(true)} className="tap text-sm font-semibold text-accent-soft shrink-0">
                Change
              </button>
            </div>

            <ChipRow label="Category">
              {CATEGORIES.map(([value, label]) => (
                <Chip key={value} active={category === value} onClick={() => setCategory(value)}>{label}</Chip>
              ))}
            </ChipRow>
            <ChipRow label="Distance">
              {RADII.map(r => (
                <Chip key={r} active={radius === r} onClick={() => setRadius(r)}>{r} mi</Chip>
              ))}
            </ChipRow>

            {nearby.events.length > 0 && (
              <div className="relative mb-3">
                <Search size={18} className="absolute left-3.5 top-3 text-faint" aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Filter these events"
                  className="field rounded-full pl-10"
                  placeholder="Filter by artist, team or venue"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                />
              </div>
            )}

            <Results nearby={nearby} shown={shown} radius={radius} filter={needle} onOpen={setOpenEvent} onWiden={() => setRadius(r => RADII[RADII.indexOf(r) + 1] || r)} />

            {nearby.status === 'ready' && nearby.events.length > 0 && (
              <p className="text-xs text-faint text-center mt-4">Event data from Ticketmaster</p>
            )}
          </>
        )}
      </div>

      {choosingPlace && <PlaceSheet onClose={() => setChoosingPlace(false)} />}
      {openEvent && <LocalEventSheet event={openEvent} onClose={() => setOpenEvent(null)} />}

      <Footer />
    </div>
  );
};

// Before there's a place: finding the phone's location (the app asks on its
// own, see AppContext), or why it couldn't, with a city search instead
const FirstRun = ({ locationError }) => (
  <div className="card p-6 text-center mt-2">
    <div className="w-14 h-14 rounded-full bg-accent/15 text-accent-soft flex items-center justify-center mx-auto mb-3">
      <Navigation size={26} className={locationError ? '' : 'animate-pulse'} aria-hidden="true" />
    </div>
    <h2 className="text-xl font-bold mb-1">See what's happening near you</h2>
    {locationError ? (
      <>
        <p className="text-sm text-muted mb-4">{locationError}</p>
        <div className="text-left">
          <CitySearch />
        </div>
      </>
    ) : (
      <p className="text-sm text-muted" role="status">Finding events near you...</p>
    )}
  </div>
);

const ChipRow = ({ label, children }) => (
  <div className="flex overflow-x-auto no-scrollbar space-x-2 mb-3 -mx-4 px-4" role="group" aria-label={label}>
    {children}
  </div>
);

const Chip = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={`shrink-0 h-11 flex items-center px-4 rounded-full text-sm font-semibold border ${
      active ? 'bg-fg text-night border-fg' : 'bg-white/[0.06] text-fg/80 border-line'
    }`}
  >
    {children}
  </button>
);

const Results = ({ nearby, shown, radius, filter, onOpen, onWiden }) => {
  if (nearby.status === 'loading') {
    return (
      <SkeletonScreen label="Loading events" className="space-y-3">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-24 rounded-card" />)}
      </SkeletonScreen>
    );
  }
  if (nearby.status === 'error') {
    return (
      <div className="card p-5 text-center">
        <p className="font-semibold mb-1">Couldn't load events</p>
        <p className="text-sm text-muted mb-3">{nearby.error}</p>
        <Button variant="secondary" onClick={nearby.reload} className="mx-auto">Try again</Button>
      </div>
    );
  }
  if (nearby.events.length === 0) {
    return (
      <div className="card p-5 text-center">
        <p className="font-semibold mb-1">Nothing within {radius} miles</p>
        <p className="text-sm text-muted mb-3">Try a wider distance or another category.</p>
        {radius < RADII[RADII.length - 1] && <Button variant="secondary" onClick={onWiden} className="mx-auto">Search farther</Button>}
      </div>
    );
  }
  if (shown.length === 0) {
    return <p className="text-sm text-muted text-center py-6">No events match "{filter}".</p>;
  }
  return (
    <div className="space-y-3">
      {shown.map(event => <LocalEventCard key={event._id} event={event} onOpen={() => onOpen(event)} />)}
    </div>
  );
};

export default Discover;
