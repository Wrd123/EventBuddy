import React, { useRef, useState } from 'react';
import { ArrowLeft, Flag, MapPin } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import Footer, { TAB_BAR_CLEARANCE } from '../layout/Footer';
import MapCanvas from '../map/MapCanvas';
import { DirectionsLink, FriendPanel, LiveBar, MeetupForm, MeetupPanel, ShareSheet } from '../map/LivePanels';
import { Button, EventCover, LocalEventCard, LocalEventSheet, PlaceSheet } from '../common';
import { useMapEvents } from '../../hooks/useMapEvents';
import { useNearbyEvents } from '../../hooks/useNearbyEvents';
import { useLive } from '../../hooks/useLive';
import { useSharing } from '../../context/SharingContext';
import { usePlace } from '../../hooks/usePlace';
import { formatDateRange, formatDay, getEventStatus, parseISODate, toISODate, todayISO } from '../../utils/dates';
import { groupByVenue, listNames } from '../../utils/map';
import { agoText, isStale } from '../../utils/live';
import { formatTime } from '../../utils/schedule';

const hasPosition = (e) => e.lat !== null && e.lng !== null;

// The days to look for other things on during an event: from its start (or
// today, once it's on) to its end, at most 31 days (the search's limit).
// null once it's over.
export const eventDays = (event, today = todayISO()) => {
  if (event.endDate < today) return null;
  const from = event.startDate > today ? event.startDate : today;
  const limit = parseISODate(from);
  limit.setDate(limit.getDate() + 31);
  const to = event.endDate < toISODate(limit) ? event.endDate : toISODate(limit);
  return { from, to };
};

// Two ways in. From an event's page (state.focus = its id) the map is about
// that event alone: where it is, what else is on nearby during it, the
// meetup point, and once it's happening, the friends sharing there. From
// the Map tab it shows everything: your upcoming events, what's on around
// you, and the friends at whichever of your events is happening now.
const Map = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { place } = usePlace();
  const mine = useMapEvents();
  const focusId = location.state?.focus || null;
  const focusEvent = mine.events.find(e => e._id === focusId) || null;
  // While the list loads, wait rather than show another event's friends
  const oneEvent = Boolean(focusId) && (Boolean(focusEvent) || mine.status === 'loading');
  const focusStatus = focusEvent ? getEventStatus(focusEvent) : null;

  // Friends only ever show for an event that's on
  const liveEvent = oneEvent
    ? (focusStatus === 'ongoing' ? focusEvent : null)
    : mine.events.find(e => getEventStatus(e) === 'ongoing') || null;
  // A meetup point can also be planned before the event starts
  const meetupEvent = oneEvent && focusStatus === 'upcoming' ? focusEvent : liveEvent;
  const live = useLive(meetupEvent?._id ?? null);

  // What's on around the event during its days, or around you
  const days = focusEvent ? eventDays(focusEvent) : null;
  const nearbyCenter = oneEvent ? (focusEvent && days && hasPosition(focusEvent) ? focusEvent : null) : place;
  const nearby = useNearbyEvents(nearbyCenter, { radius: 25, category: 'all', ...(oneEvent ? days : null) });

  const [show, setShow] = useState({ mine: true, nearby: true, friends: true });
  const focusPinId = focusId ? `mine:${focusId}` : null;
  const [selectedId, setSelectedId] = useState(null);
  const [choosingPlace, setChoosingPlace] = useState(false);
  const [openEvent, setOpenEvent] = useState(null);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [placingMeetup, setPlacingMeetup] = useState(false);
  const canvasRef = useRef(null);

  // Your own position comes from app-wide sharing, which keeps running when
  // you leave the map; shown here when it's for this event
  const sharing = useSharing();
  const me = sharing.share && sharing.share.eventId === liveEvent?._id
    ? { position: sharing.position, error: sharing.error }
    : { position: null, error: '' };

  const shownEvents = oneEvent
    ? (focusEvent ? [focusEvent] : [])
    : mine.events.filter(e => getEventStatus(e) !== 'past');
  const mapped = shownEvents.filter(hasPosition);
  const unmapped = shownEvents.filter(e => !hasPosition(e));
  const venues = groupByVenue(nearby.events);

  const friendPins = liveEvent && show.friends
    ? [
        ...live.people.map(p => ({
          id: `friend:${p.user}`,
          kind: 'friend',
          lat: p.lat,
          lng: p.lng,
          label: p.name,
          color: p.color,
          initial: p.name.charAt(0),
          caption: `${p.name} • ${agoText(p.positionAt)}`,
          stale: isStale(p.positionAt)
        })),
        ...(me.position ? [{ id: 'me', kind: 'me', lat: me.position.lat, lng: me.position.lng, label: 'You' }] : [])
      ]
    : [];
  // The meetup point shows with the friends, or on its own before the event
  const meetupPins = live.meetup && (show.friends || !liveEvent)
    ? [{ id: 'meetup', kind: 'meetup', lat: live.meetup.lat, lng: live.meetup.lng, label: live.meetup.note || 'Meetup point' }]
    : [];
  const livePins = [...friendPins, ...meetupPins];

  const pins = [
    ...(show.mine ? mapped.map(e => ({ id: `mine:${e._id}`, kind: 'mine', lat: e.lat, lng: e.lng, label: e.name })) : []),
    ...(show.nearby
      ? venues.map(v => ({ id: v.id, kind: 'nearby', lat: v.lat, lng: v.lng, label: v.venue || 'Venue', count: v.events.length }))
      : []),
    ...livePins
  ];

  // Selections that are hidden (layer off) or gone count as nothing selected
  const selectedPin = pins.find(p => p.id === selectedId);
  const selectedEvent = selectedPin?.kind === 'mine' && mapped.find(e => `mine:${e._id}` === selectedId);
  const selectedVenue = selectedPin?.kind === 'nearby' && venues.find(v => v.id === selectedId);
  const selectedPerson = selectedPin?.kind === 'friend' && live.people.find(p => `friend:${p.user}` === selectedId);
  const selectedMeetup = selectedPin?.kind === 'meetup' && live.meetup;

  const toggle = (layer) => setShow(prev => ({ ...prev, [layer]: !prev[layer] }));
  // With friends or a meetup point on the map, it frames them and their
  // event rather than everything
  const liveIds = livePins.length > 0 ? [...livePins.map(p => p.id), `mine:${meetupEvent._id}`] : null;
  const fitKey = [oneEvent, show.mine, show.nearby, show.friends, mine.status, nearby.status, live.status, place?.lat, place?.lng].join('|');

  const startPlacingMeetup = () => {
    setSelectedId(null);
    setPlacingMeetup(true);
  };

  const saveMeetup = async ({ note, time }) => {
    await live.setMeetup({ ...canvasRef.current.getCenter(), note, time });
    setPlacingMeetup(false);
    setSelectedId('meetup');
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className="relative flex-1 overflow-hidden">
        <MapCanvas
          ref={canvasRef}
          pins={pins}
          selectedId={selectedPin ? selectedId : null}
          onSelect={placingMeetup ? () => {} : setSelectedId}
          fitKey={fitKey}
          fitIds={liveIds}
          fallbackCenter={oneEvent ? (focusEvent && hasPosition(focusEvent) ? focusEvent : null) : place}
          focusId={focusPinId}
        />
        {placingMeetup && (
          <div className="eb-crosshair" aria-hidden="true">
            <div className="eb-pin eb-pin-meetup">
              <Flag size={16} strokeWidth={2.5} />
            </div>
          </div>
        )}

        {/* Above Leaflet's own layers, which go up to z-index 1000 */}
        <div className="absolute top-0 inset-x-0 z-[1100] p-4 space-y-2 pointer-events-none">
          {oneEvent && (
            <button
              onClick={() => navigate(`/events/${focusId}`)}
              className="glass pointer-events-auto inline-flex items-center max-w-full h-10 rounded-full px-4 text-sm font-semibold transition-transform active:scale-95"
              aria-label={`Back to ${focusEvent?.name || 'the event'}`}
            >
              <ArrowLeft size={16} className="mr-1.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{focusEvent?.name || 'Event'}</span>
            </button>
          )}
          <div className="flex flex-wrap gap-2 pointer-events-auto" role="group" aria-label="Show on map">
            {liveEvent && (
              // From the Map tab, say whose friends these are
              <LayerChip active={show.friends} dotClass="bg-go" onClick={() => toggle('friends')}>
                {oneEvent ? 'Friends' : `Friends at ${liveEvent.name}`}
              </LayerChip>
            )}
            {!oneEvent && (
              <LayerChip active={show.mine} dotClass="bg-accent" onClick={() => toggle('mine')}>Your events</LayerChip>
            )}
            <LayerChip active={show.nearby} dotClass="bg-[#a78bfa]" onClick={() => toggle('nearby')}>Nearby</LayerChip>
          </div>
          {!oneEvent && (
            <button
              onClick={() => setChoosingPlace(true)}
              className="glass pointer-events-auto inline-flex items-center max-w-full h-9 rounded-full px-3.5 text-sm"
              aria-label={place ? `Change location, now near ${place.label}` : 'Choose a location for nearby events'}
            >
              <MapPin size={16} className="mr-1.5 text-accent-soft shrink-0" aria-hidden="true" />
              <span className="truncate">{place ? `Near ${place.label}` : 'Choose a location'}</span>
            </button>
          )}
        </div>
      </div>

      {/* A glass sheet over the bottom of the map; the tab bar floats over its foot */}
      <div className={`glass relative z-10 -mt-6 rounded-t-[28px] border-b-0 px-4 pt-4 max-h-[55%] overflow-y-auto ${TAB_BAR_CLEARANCE}`}>
        {placingMeetup ? (
          <MeetupForm existing={live.meetup} onSave={saveMeetup} onCancel={() => setPlacingMeetup(false)} />
        ) : selectedPerson ? (
          <FriendPanel person={selectedPerson} />
        ) : selectedMeetup ? (
          <MeetupPanel meetup={selectedMeetup} onClear={async () => { await live.clearMeetup(); setSelectedId(null); }} />
        ) : selectedEvent ? (
          <EventPanel event={selectedEvent} />
        ) : selectedVenue ? (
          <VenuePanel venue={selectedVenue} onOpen={setOpenEvent} />
        ) : oneEvent ? (
          focusEvent ? (
            <EventPlan
              event={focusEvent}
              status={focusStatus}
              meetup={live.meetup}
              nearby={nearby}
              venueCount={venues.length}
              liveBar={liveEvent && (
                <LiveBar
                  event={liveEvent}
                  live={live}
                  trackingError={me.error}
                  onShare={() => setSharingOpen(true)}
                  onSetMeetup={startPlacingMeetup}
                />
              )}
              onPlanMeetup={startPlacingMeetup}
              onShowMeetup={() => setSelectedId('meetup')}
            />
          ) : (
            <p className="text-sm text-muted">Loading the event...</p>
          )
        ) : (
          <>
            {liveEvent && (
              <LiveBar
                event={liveEvent}
                live={live}
                trackingError={me.error}
                onShare={() => setSharingOpen(true)}
                onSetMeetup={startPlacingMeetup}
              />
            )}
            <Summary
              mine={mine}
              mappedCount={mapped.length}
              unmapped={unmapped}
              place={place}
              nearby={nearby}
              venueCount={venues.length}
              onChoosePlace={() => setChoosingPlace(true)}
            />
          </>
        )}
      </div>

      <Footer />

      {choosingPlace && <PlaceSheet onClose={() => setChoosingPlace(false)} />}
      {openEvent && <LocalEventSheet event={openEvent} onClose={() => setOpenEvent(null)} />}
      {sharingOpen && liveEvent && (
        <ShareSheet event={liveEvent} onShare={live.startSharing} onClose={() => setSharingOpen(false)} />
      )}
    </div>
  );
};

const LayerChip = ({ active, dotClass, onClick, children }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={`glass flex items-center h-9 px-3.5 rounded-full text-sm font-semibold transition-all active:scale-95 ${
      active ? 'text-fg' : 'text-fg/45'
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
          <EventCover event={event} width={56} className="w-full h-full" />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold truncate">{event.name}</h2>
          <p className="text-sm text-accent-soft">{formatDateRange(event.startDate, event.endDate)}</p>
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
        <button onClick={mine.reload} className="font-semibold text-accent-soft">Try again</button>
      </div>
    ) : (
      <Line dotClass="bg-accent">
        {mine.status === 'loading'
          ? 'Finding your events...'
          : `${mappedCount} upcoming ${mappedCount === 1 ? 'event' : 'events'} of yours`}
      </Line>
    )}

    {!place ? (
      <div className="flex items-center justify-between">
        <span className="text-muted">See concerts, games and shows nearby.</span>
        <button onClick={onChoosePlace} className="font-semibold text-accent-soft shrink-0 ml-2">Choose a location</button>
      </div>
    ) : (
      <Line dotClass="bg-[#a78bfa]">
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

// The panel for a map opened from an event, by where the event stands.
// Before it starts there's nobody to show, so it says when sharing opens and
// helps plan: directions, a meetup point, and what else is on nearby then.
const EventPlan = ({ event, status, meetup, nearby, venueCount, liveBar, onPlanMeetup, onShowMeetup }) => {
  const when = event.startDate === event.endDate ? 'that day' : 'during the event';
  return (
    <div className="space-y-3 text-sm">
      {liveBar}
      {status === 'upcoming' && (
        <>
          <Line dotClass="bg-go">
            Location sharing opens {formatDay(event.startDate)}. Friends who choose to share will show up here.
          </Line>
          {meetup && (
            <button onClick={onShowMeetup} className="flex items-center text-left text-fg/90">
              <Flag size={14} className="mr-2 text-amber-400 shrink-0" aria-hidden="true" />
              <span className="truncate">
                Meetup: {meetup.note || 'Meetup point'}{meetup.time && `, ${formatTime(meetup.time)}`} on the first day
              </span>
            </button>
          )}
          <div className="flex space-x-2">
            {event.location && <DirectionsLink to={event.location} />}
            <Button variant="secondary" onClick={onPlanMeetup} icon={<Flag size={16} />} className="flex-1">
              {meetup ? 'Move meetup' : 'Plan meetup'}
            </Button>
          </div>
        </>
      )}
      {status === 'past' && <Line dotClass="bg-faint">This event is over, so location sharing has ended.</Line>}
      {status !== 'past' && hasPosition(event) && (
        <Line dotClass="bg-[#a78bfa]">
          {nearby.status === 'error'
            ? nearby.error
            : nearby.status === 'ready'
              ? nearby.events.length === 0
                ? `Nothing else on nearby ${when}.`
                : `${nearby.events.length} other ${nearby.events.length === 1 ? 'event' : 'events'} nearby ${when}, at ${venueCount} ${venueCount === 1 ? 'venue' : 'venues'}`
              : `Finding what else is on nearby ${when}...`}
        </Line>
      )}
      {!hasPosition(event) && (
        <p className="text-muted">
          {event.location
            ? `Couldn't find "${event.location}" on the map. A location like "City, ST" puts it here.`
            : 'Add a location like "City, ST" to put this event on the map.'}
        </p>
      )}
    </div>
  );
};

const Line = ({ dotClass, children }) => (
  <p className="flex items-center text-fg/90">
    <span className={`w-2.5 h-2.5 rounded-full mr-2 shrink-0 ${dotClass}`} aria-hidden="true" />
    {children}
  </p>
);

export default Map;
