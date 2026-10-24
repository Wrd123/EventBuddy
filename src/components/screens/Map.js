import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import Footer from '../layout/Footer';
import MapCanvas from '../map/MapCanvas';
import { Button, EventArt, LocalEventCard, LocalEventSheet, PlaceSheet } from '../common';
import { useMapEvents } from '../../hooks/useMapEvents';
import { useNearbyEvents } from '../../hooks/useNearbyEvents';
import { usePlace } from '../../hooks/usePlace';
import { formatDateRange, getEventStatus } from '../../utils/dates';
import { groupByVenue, listNames } from '../../utils/map';

const hasPosition = (e) => e.lat !== null && e.lng !== null;

// Your upcoming events and nearby Ticketmaster events on one map. Nobody's
// own location is on it: "nearby" is around the place you chose in Discover.
// Opening it from an event (state.focus = event id) starts on that event.
const Map = () => {
  const location = useLocation();
  const { place } = usePlace();
  const mine = useMapEvents();
  const nearby = useNearbyEvents(place, { radius: 25, category: 'all' });
  const [show, setShow] = useState({ mine: true, nearby: true });
  const focusId = location.state?.focus ? `mine:${location.state.focus}` : null;
  const [selectedId, setSelectedId] = useState(focusId);
  const [choosingPlace, setChoosingPlace] = useState(false);
  const [openEvent, setOpenEvent] = useState(null);

  const upcoming = mine.events.filter(e => getEventStatus(e) !== 'past');
  const mapped = upcoming.filter(hasPosition);
  const unmapped = upcoming.filter(e => !hasPosition(e));
  const venues = groupByVenue(nearby.events);

  const pins = [
    ...(show.mine ? mapped.map(e => ({ id: `mine:${e._id}`, kind: 'mine', lat: e.lat, lng: e.lng, label: e.name })) : []),
    ...(show.nearby
      ? venues.map(v => ({ id: v.id, kind: 'nearby', lat: v.lat, lng: v.lng, label: v.venue || 'Venue', count: v.events.length }))
      : [])
  ];

  // Selections that are hidden (layer off) or gone count as nothing selected
  const selectedPin = pins.find(p => p.id === selectedId);
  const selectedEvent = selectedPin?.kind === 'mine' && mapped.find(e => `mine:${e._id}` === selectedId);
  const selectedVenue = selectedPin?.kind === 'nearby' && venues.find(v => v.id === selectedId);

  const toggle = (layer) => setShow(prev => ({ ...prev, [layer]: !prev[layer] }));
  const fitKey = [show.mine, show.nearby, mine.status, nearby.status, place?.lat, place?.lng].join('|');

  return (
    <div className="flex flex-col h-full relative">
      <div className="relative flex-1 overflow-hidden">
        <MapCanvas
          pins={pins}
          selectedId={selectedPin ? selectedId : null}
          onSelect={setSelectedId}
          fitKey={fitKey}
          fallbackCenter={place}
          focusId={focusId}
        />

        {/* Above Leaflet's own layers, which go up to z-index 1000 */}
        <div className="absolute top-0 inset-x-0 z-[1100] p-4 space-y-2 pointer-events-none">
          <div className="flex space-x-2 pointer-events-auto" role="group" aria-label="Show on map">
            <LayerChip active={show.mine} dotClass="bg-violet" onClick={() => toggle('mine')}>Your events</LayerChip>
            <LayerChip active={show.nearby} dotClass="bg-pink-500" onClick={() => toggle('nearby')}>Nearby</LayerChip>
          </div>
          <button
            onClick={() => setChoosingPlace(true)}
            className="pointer-events-auto inline-flex items-center max-w-full rounded-full bg-surface/90 border border-line backdrop-blur px-3 py-1.5 text-sm"
            aria-label={place ? `Change location, now near ${place.label}` : 'Choose a location for nearby events'}
          >
            <MapPin size={16} className="mr-1.5 text-violet-soft shrink-0" aria-hidden="true" />
            <span className="truncate">{place ? `Near ${place.label}` : 'Choose a location'}</span>
          </button>
        </div>
      </div>

      <div className="bg-surface border-t border-line px-4 pt-3 pb-4 max-h-[45%] overflow-y-auto">
        {selectedEvent ? (
          <EventPanel event={selectedEvent} />
        ) : selectedVenue ? (
          <VenuePanel venue={selectedVenue} onOpen={setOpenEvent} />
        ) : (
          <Summary
            mine={mine}
            mappedCount={mapped.length}
            unmapped={unmapped}
            place={place}
            nearby={nearby}
            venueCount={venues.length}
            onChoosePlace={() => setChoosingPlace(true)}
          />
        )}
      </div>

      <Footer />

      {choosingPlace && <PlaceSheet onClose={() => setChoosingPlace(false)} />}
      {openEvent && <LocalEventSheet event={openEvent} onClose={() => setOpenEvent(null)} />}
    </div>
  );
};

const LayerChip = ({ active, dotClass, onClick, children }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={`flex items-center px-3 py-1.5 rounded-full text-sm font-semibold border backdrop-blur ${
      active ? 'bg-surface/90 text-fg border-violet/60' : 'bg-surface/60 text-faint border-line'
    }`}
  >
    <span className={`w-2.5 h-2.5 rounded-full mr-2 ${dotClass} ${active ? '' : 'opacity-40'}`} aria-hidden="true" />
    {children}
  </button>
);

const EventPanel = ({ event }) => {
  const navigate = useNavigate();
  return (
    <div>
      <div className="flex items-center mb-3">
        <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 mr-3">
          <EventArt type={event.type} seed={event._id} className="w-full h-full" />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold truncate">{event.name}</h2>
          <p className="text-sm text-violet-soft">{formatDateRange(event.startDate, event.endDate)}</p>
          <p className="text-sm text-muted truncate">{event.location}</p>
        </div>
      </div>
      <Button fullWidth onClick={() => navigate(`/events/${event._id}`)}>Open event</Button>
    </div>
  );
};

const VenuePanel = ({ venue, onOpen }) => (
  <div>
    <h2 className="font-bold">{venue.venue || 'Venue'}</h2>
    <p className="text-sm text-muted mb-3">
      {venue.events.length} upcoming {venue.events.length === 1 ? 'event' : 'events'}
    </p>
    <div className="space-y-2">
      {venue.events.map(event => <LocalEventCard key={event._id} event={event} onOpen={() => onOpen(event)} />)}
    </div>
    <p className="text-xs text-faint text-center mt-3">Event data from Ticketmaster</p>
  </div>
);

const Summary = ({ mine, mappedCount, unmapped, place, nearby, venueCount, onChoosePlace }) => (
  <div className="space-y-2 text-sm">
    {mine.status === 'error' ? (
      <div className="flex items-center justify-between">
        <span className="text-muted">Couldn't load your events.</span>
        <button onClick={mine.reload} className="font-semibold text-violet-soft">Try again</button>
      </div>
    ) : (
      <Line dotClass="bg-violet">
        {mine.status === 'loading'
          ? 'Finding your events...'
          : `${mappedCount} upcoming ${mappedCount === 1 ? 'event' : 'events'} of yours`}
      </Line>
    )}

    {!place ? (
      <div className="flex items-center justify-between">
        <span className="text-muted">See concerts, games and shows nearby.</span>
        <button onClick={onChoosePlace} className="font-semibold text-violet-soft shrink-0 ml-2">Choose a location</button>
      </div>
    ) : (
      <Line dotClass="bg-pink-500">
        {nearby.status === 'error'
          ? nearby.error
          : nearby.status === 'ready'
            ? `${nearby.events.length} nearby ${nearby.events.length === 1 ? 'event' : 'events'} at ${venueCount} ${venueCount === 1 ? 'venue' : 'venues'}`
            : 'Finding events nearby...'}
      </Line>
    )}

    {unmapped.length > 0 && (
      <p className="text-muted">
        {listNames(unmapped.map(e => e.name))} {unmapped.length === 1 ? "isn't" : "aren't"} on the map. A location like
        "City, ST" puts {unmapped.length === 1 ? 'it' : 'them'} here.
      </p>
    )}
    {(mappedCount > 0 || venueCount > 0) && <p className="text-faint">Tap a pin for details.</p>}
  </div>
);

const Line = ({ dotClass, children }) => (
  <p className="flex items-center text-fg/90">
    <span className={`w-2.5 h-2.5 rounded-full mr-2 shrink-0 ${dotClass}`} aria-hidden="true" />
    {children}
  </p>
);

export default Map;
