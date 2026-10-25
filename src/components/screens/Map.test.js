import React, { act } from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi, settle, removeEvent } from '../../testUtils/fakeApi';
import { routerFuture } from '../../App';
import MainLayout from '../layout/MainLayout';
import { eventDays } from './Map';

// Leaflet can't draw in jsdom, so the map is replaced by its pins as buttons.
// Its center (where a new meetup point goes) is always MAP_CENTER.
// (No JSX in a jest.mock factory: it's hoisted above the imports.)
const MAP_CENTER = { lat: 33.7861, lng: -84.3732 };
jest.mock('../map/MapCanvas', () => {
  const { createElement, forwardRef, useImperativeHandle } = require('react');
  return forwardRef(({ pins, selectedId, onSelect }, ref) => {
    useImperativeHandle(ref, () => ({ getCenter: () => ({ lat: 33.7861, lng: -84.3732 }) }));
    return createElement('div', { 'data-testid': 'map' },
      pins.map(pin => createElement('button', {
        key: pin.id,
        'aria-label': `${{ mine: 'Your event', nearby: 'Venue', friend: 'Friend', meetup: 'Meetup', me: 'You' }[pin.kind]}: ${pin.label}${pin.count > 1 ? ` (${pin.count})` : ''}`,
        'aria-pressed': pin.id === selectedId,
        'data-caption': pin.caption,
        onClick: () => onSelect(pin.id)
      }))
    );
  });
});

const ATLANTA = { label: 'Atlanta, GA', lat: 33.75, lng: -84.39, source: 'search' };

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

const pin = (name) => screen.findByRole('button', { name });

beforeEach(() => localStorage.clear());

describe('Map', () => {
  beforeEach(() => {
    localStorage.setItem('eventbuddy_place', JSON.stringify(ATLANTA));
    installFakeApi().logIn();
  });

  it('shows your upcoming events and nearby venues', async () => {
    renderAt('/map');

    expect(await pin('Your event: Summer Music Festival')).toBeInTheDocument();
    // Two shows at the same arena share one pin
    expect(await pin('Venue: State Farm Arena (2)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Venue: Fox Theatre' })).toBeInTheDocument();

    expect(screen.getByText('1 upcoming event of yours')).toBeInTheDocument();
    expect(screen.getByText('3 nearby events at 2 venues')).toBeInTheDocument();
    expect(screen.getByText(/Hiking Trip isn't on the map/)).toBeInTheDocument();
  });

  it('shows one of your events and opens it', async () => {
    renderAt('/map');

    fireEvent.click(await pin('Your event: Summer Music Festival'));
    expect(screen.getByRole('heading', { name: 'Summer Music Festival' })).toBeInTheDocument();
    expect(screen.getByText('Indio, CA')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open event' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Summer Music Festival' })).toBeInTheDocument();
    await settle();
  });

  it("lists a venue's events, each ready to plan with friends", async () => {
    renderAt('/map');

    fireEvent.click(await pin('Venue: State Farm Arena (2)'));
    expect(screen.getByRole('heading', { name: 'State Farm Arena' })).toBeInTheDocument();
    expect(screen.getByText('2 upcoming events')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Atlanta Hawks vs. Boston Celtics'));
    const sheet = screen.getByRole('dialog', { name: 'Atlanta Hawks vs. Boston Celtics' });
    expect(within(sheet).getByRole('button', { name: 'Plan with friends' })).toBeInTheDocument();
  });

  it('turns each kind of pin on and off', async () => {
    renderAt('/map');
    await pin('Venue: Fox Theatre');
    const layers = screen.getByRole('group', { name: 'Show on map' });

    fireEvent.click(within(layers).getByRole('button', { name: 'Nearby' }));
    expect(within(layers).getByRole('button', { name: 'Nearby' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Venue: Fox Theatre' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Your event: Summer Music Festival' })).toBeInTheDocument();

    fireEvent.click(within(layers).getByRole('button', { name: 'Your events' }));
    expect(screen.queryByRole('button', { name: /^Your event:/ })).not.toBeInTheDocument();
  });

  it('clears a selection whose pins are turned off', async () => {
    renderAt('/map');
    fireEvent.click(await pin('Venue: Fox Theatre'));
    expect(screen.getByRole('heading', { name: 'Fox Theatre' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));
    expect(screen.queryByRole('heading', { name: 'Fox Theatre' })).not.toBeInTheDocument();
    expect(screen.getByText('1 upcoming event of yours')).toBeInTheDocument();
  });

  it('opened from an event, helps plan it before it starts', async () => {
    renderAt('/events/1');
    fireEvent.click(await screen.findByRole('button', { name: 'Map' }));
    await settle();

    expect(await screen.findByText(/Location sharing opens Thu, Apr 15/)).toBeInTheDocument();
    expect(await pin('Your event: Summer Music Festival')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get directions' }))
      .toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=Indio%2C%20CA');
    // What else is on near the festival during it, not near you today
    const searches = global.fetch.mock.calls.map(([url]) => url).filter(url => url.startsWith('/api/discover/events'));
    expect(searches.at(-1)).toMatch(/from=2027-04-15&to=2027-04-18/);
    expect(await screen.findByText('3 other events nearby during the event, at 2 venues')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Summer Music Festival' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Summer Music Festival' })).toBeInTheDocument();
    await settle();
  });
});

describe('Map without a location', () => {
  beforeEach(() => installFakeApi().logIn());

  it('shows your events and asks where to look for nearby ones', async () => {
    renderAt('/map');

    expect(await pin('Your event: Summer Music Festival')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Venue:/ })).not.toBeInTheDocument();
    expect(global.fetch.mock.calls.some(([url]) => url.startsWith('/api/discover/events'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Choose a location for nearby events' }));
    fireEvent.change(screen.getByLabelText('City or ZIP code'), { target: { value: '30030' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await pin('Venue: State Farm Arena (2)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change location, now near Decatur, GA' })).toBeInTheDocument();
  });
});

// Requests the app made, as [url, options]
const requests = (method, prefix) =>
  global.fetch.mock.calls.filter(([url, opts = {}]) => (opts.method || 'GET') === method && url.startsWith(prefix));
const bodyOf = ([, options]) => JSON.parse(options.body);

// A phone that reports one position as soon as it's watched
const mockWatchPosition = (impl) => {
  // getCurrentPosition never answers, like a location prompt left open, so
  // only the sharing under test moves
  const geolocation = { watchPosition: jest.fn(impl), clearWatch: jest.fn(), getCurrentPosition: jest.fn() };
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geolocation });
  return geolocation;
};
const HERE = { latitude: 33.7849, longitude: -84.3735, accuracy: 8 };

describe('Map during an event', () => {
  beforeEach(() => installFakeApi({ liveEvent: true }).logIn());

  it('shows the friends sharing their location and the meetup point', async () => {
    renderAt('/map');

    const alex = await pin('Friend: Alex');
    expect(alex.dataset.caption).toBe('Alex • 2 min ago');
    expect(screen.getByRole('button', { name: 'Meetup: By the lake' })).toBeInTheDocument();
    const bar = screen.getByRole('region', { name: 'Live at Picnic in the Park' });
    expect(bar).toHaveTextContent('1 friend is sharing their location.');
    // From the Map tab, it says whose friends these are
    expect(within(screen.getByRole('group', { name: 'Show on map' })).getByRole('button', { name: 'Friends at Picnic in the Park' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  it("opened from an event that hasn't started, shows nobody, even with another event on now", async () => {
    renderAt('/events/1');
    fireEvent.click(await screen.findByRole('button', { name: 'Map' }));
    await settle();

    expect(await pin('Your event: Summer Music Festival')).toBeInTheDocument();
    expect(await screen.findByText(/Location sharing opens/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Friend:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Meetup:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Your event: Picnic in the Park' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Friends/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Live at/ })).not.toBeInTheDocument();
    await settle();
  });

  it('opened from the event that is on, shows its friends', async () => {
    renderAt('/events/5');
    fireEvent.click(await screen.findByRole('button', { name: 'Map' }));

    expect(await pin('Friend: Alex')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Live at Picnic in the Park' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Show on map' })).getByRole('button', { name: 'Friends' }))
      .toHaveAttribute('aria-pressed', 'true');
    await settle();
  });

  it('plans a meetup point before the event starts', async () => {
    renderAt('/events/1');
    fireEvent.click(await screen.findByRole('button', { name: 'Map' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Plan meetup' }));
    fireEvent.change(screen.getByLabelText('Meetup note'), { target: { value: 'North gate' } });
    fireEvent.change(screen.getByLabelText('Meetup time'), { target: { value: '10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save meetup' }));

    expect(await pin('Meetup: North gate')).toBeInTheDocument();
    expect(bodyOf(requests('PUT', '/api/events/1/live/meetup')[0])).toEqual({ ...MAP_CENTER, note: 'North gate', time: '10:00' });
    await settle();
  });

  it("shows when a friend last updated, with directions to them", async () => {
    renderAt('/map');

    fireEvent.click(await pin('Friend: Alex'));

    expect(screen.getByRole('heading', { name: 'Alex' })).toBeInTheDocument();
    expect(screen.getByText(/Updated 2 min ago/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get directions' }))
      .toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=33.7866,-84.3727');
  });

  it('shares your location for as long as you choose, then stops', async () => {
    const geolocation = mockWatchPosition((success) => {
      success({ coords: HERE });
      return 7;
    });
    renderAt('/map');
    await pin('Friend: Alex');

    fireEvent.click(screen.getByRole('button', { name: 'Share my location' }));
    const sheet = screen.getByRole('dialog', { name: 'Share your location' });
    // In a browser, sharing pauses when the app isn't open, and it says so
    expect(sheet).toHaveTextContent("On the web, updates pause while EventBuddy isn't open.");
    fireEvent.click(within(sheet).getByRole('button', { name: '1 hour' }));

    // Asked for an hour from now
    await waitFor(() => expect(requests('PUT', '/api/events/5/live/share')).toHaveLength(1));
    const until = new Date(bodyOf(requests('PUT', '/api/events/5/live/share')[0]).until);
    expect(Math.abs(until - Date.now() - 60 * 60 * 1000)).toBeLessThan(5000);

    // The phone's position goes to the event, and you appear on the map
    await waitFor(() => expect(requests('PUT', '/api/events/5/live/position')).toHaveLength(1));
    expect(bodyOf(requests('PUT', '/api/events/5/live/position')[0])).toEqual({ lat: 33.7849, lng: -84.3735, accuracy: 8 });
    expect(await pin('You: You')).toBeInTheDocument();
    expect(screen.getByText(/You're sharing your location until/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(await screen.findByRole('button', { name: 'Share my location' })).toBeInTheDocument();
    expect(requests('DELETE', '/api/events/5/live/share')).toHaveLength(1);
    expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
    expect(screen.queryByRole('button', { name: 'You: You' })).not.toBeInTheDocument();
  });

  it('only sends a new position after moving a little', async () => {
    let report;
    mockWatchPosition((success) => {
      report = success;
      return 1;
    });
    renderAt('/map');
    await pin('Friend: Alex');
    fireEvent.click(screen.getByRole('button', { name: 'Share my location' }));
    fireEvent.click(screen.getByRole('button', { name: '1 hour' }));
    await waitFor(() => expect(report).toBeDefined());

    // The phone reporting a new position, as the browser would
    const move = (latitude) => act(() => report({ coords: { ...HERE, latitude } }));
    move(33.78490);
    await waitFor(() => expect(requests('PUT', '/api/events/5/live/position')).toHaveLength(1));
    move(33.78492); // about 2 m: not worth sending
    move(33.78530); // about 45 m
    await waitFor(() => expect(requests('PUT', '/api/events/5/live/position')).toHaveLength(2));
    expect(bodyOf(requests('PUT', '/api/events/5/live/position')[1]).lat).toBe(33.7853);
  });

  it('explains when location is turned off', async () => {
    mockWatchPosition((success, failure) => failure({ code: 1 }));
    renderAt('/map');
    await pin('Friend: Alex');

    fireEvent.click(screen.getByRole('button', { name: 'Share my location' }));
    fireEvent.click(screen.getByRole('button', { name: '1 hour' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Location is turned off for EventBuddy.');

    // Stopping clears it: nothing is being tracked anymore
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(await screen.findByRole('button', { name: 'Share my location' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('moves the meetup point to where the map is centered', async () => {
    renderAt('/map');
    await pin('Meetup: By the lake');

    fireEvent.click(screen.getByRole('button', { name: 'Move meetup' }));
    fireEvent.change(screen.getByLabelText('Meetup note'), { target: { value: 'Gate 2' } });
    fireEvent.change(screen.getByLabelText('Meetup time'), { target: { value: '18:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save meetup' }));

    expect(await pin('Meetup: Gate 2')).toHaveAttribute('aria-pressed', 'true');
    expect(bodyOf(requests('PUT', '/api/events/5/live/meetup')[0])).toEqual({ ...MAP_CENTER, note: 'Gate 2', time: '18:30' });
    expect(screen.getByText(/At 6:30 PM/)).toBeInTheDocument();
  });

  it('removes the meetup point', async () => {
    renderAt('/map');
    fireEvent.click(await pin('Meetup: By the lake'));
    expect(screen.getByText(/Set by Taylor 20 min ago/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /^Meetup:/ })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Set meetup' })).toBeInTheDocument();
  });

  it('hides friends with their layer turned off', async () => {
    renderAt('/map');
    await pin('Friend: Alex');

    fireEvent.click(within(screen.getByRole('group', { name: 'Show on map' })).getByRole('button', { name: 'Friends at Picnic in the Park' }));

    expect(screen.queryByRole('button', { name: 'Friend: Alex' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Meetup:/ })).not.toBeInTheDocument();
  });
});

describe('Map with no event happening', () => {
  beforeEach(() => installFakeApi().logIn());

  it("doesn't offer live locations", async () => {
    renderAt('/map');
    await pin('Your event: Summer Music Festival');

    expect(screen.queryByRole('region', { name: /^Live at/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Friends/ })).not.toBeInTheDocument();
    expect(requests('GET', '/api/events/1/live')).toHaveLength(0);
  });
});

describe('Sharing across the app', () => {
  const HOUR_AHEAD = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const storedShare = () => JSON.parse(localStorage.getItem('eventbuddy_share'));

  // As if sharing had started earlier: on the server, and remembered here
  const alreadySharing = async () => {
    const until = HOUR_AHEAD();
    await global.fetch('/api/events/5/live/share', {
      method: 'PUT',
      headers: { Authorization: 'Bearer fake-token' },
      body: JSON.stringify({ until })
    });
    localStorage.setItem('eventbuddy_share', JSON.stringify({ eventId: '5', until }));
    global.fetch.mockClear();
  };

  let report;
  let geolocation;
  beforeEach(() => {
    installFakeApi({ liveEvent: true }).logIn();
    geolocation = mockWatchPosition((success) => {
      report = success;
      return 3;
    });
  });

  it('keeps sending your position after you leave the map', async () => {
    renderAt('/map');
    await pin('Friend: Alex');
    fireEvent.click(screen.getByRole('button', { name: 'Share my location' }));
    fireEvent.click(screen.getByRole('button', { name: '1 hour' }));
    await waitFor(() => expect(report).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Chats' }));
    await screen.findByRole('heading', { name: 'Chats' });
    act(() => report({ coords: HERE }));

    await waitFor(() => expect(requests('PUT', '/api/events/5/live/position')).toHaveLength(1));
    expect(geolocation.clearWatch).not.toHaveBeenCalled();
    expect(storedShare()).toMatchObject({ eventId: '5' });
    await screen.findByRole('button', { name: /^Picnic in the Park/ });
  });

  it('picks sharing back up when the app is reopened, on any screen', async () => {
    await alreadySharing();
    renderAt('/groups');

    await waitFor(() => expect(report).toBeDefined());
    act(() => report({ coords: HERE }));
    await waitFor(() => expect(requests('PUT', '/api/events/5/live/position')).toHaveLength(1));
    await screen.findByRole('button', { name: /^Picnic in the Park/ });
  });

  it('stops when sharing was ended somewhere else', async () => {
    // Remembered here, but no longer on the server
    localStorage.setItem('eventbuddy_share', JSON.stringify({ eventId: '5', until: HOUR_AHEAD() }));
    renderAt('/groups');
    await waitFor(() => expect(report).toBeDefined());

    act(() => report({ coords: HERE }));

    await waitFor(() => expect(geolocation.clearWatch).toHaveBeenCalledWith(3));
    expect(storedShare()).toBeNull();
    await screen.findByRole('button', { name: /^Picnic in the Park/ });
  });

  it("stops when you're no longer in the event", async () => {
    await alreadySharing();
    renderAt('/groups');
    await waitFor(() => expect(report).toBeDefined());
    removeEvent('5'); // you left on another phone, or the organizer removed you

    act(() => report({ coords: HERE }));

    await waitFor(() => expect(geolocation.clearWatch).toHaveBeenCalledWith(3));
    expect(storedShare()).toBeNull();
  });

  it("says so when logging out can't stop sharing on the server, and lets you retry", async () => {
    installFakeApi({ liveEvent: true, stopShareFails: 1 }).logIn();
    await alreadySharing();
    renderAt('/profile');
    await waitFor(() => expect(report).toBeDefined());

    fireEvent.click(await screen.findByRole('button', { name: /Log out/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't stop sharing your location on the server. Friends can still see your last spot until/);
    // This phone stopped tracking anyway, and you're still logged in
    await waitFor(() => expect(geolocation.clearWatch).toHaveBeenCalledWith(3));
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByLabelText('Email');
    expect(requests('DELETE', '/api/events/5/live/share')).toHaveLength(2);
  });

  it("still warns after you leave Profile and come back", async () => {
    installFakeApi({ liveEvent: true, stopShareFails: 1 }).logIn();
    await alreadySharing();
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Open profile' }));

    fireEvent.click(await screen.findByRole('button', { name: /Log out/ }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open profile' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't stop sharing your location on the server/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByLabelText('Email');
    expect(requests('DELETE', '/api/events/5/live/share')).toHaveLength(2);
  });

  it('lets you log out anyway when the server still has your share', async () => {
    installFakeApi({ liveEvent: true, stopShareFails: 1 }).logIn();
    await alreadySharing();
    renderAt('/profile');

    fireEvent.click(await screen.findByRole('button', { name: /Log out/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Log out anyway' }));

    await screen.findByLabelText('Email');
    expect(storedShare()).toBeNull();
  });

  it("won't start sharing here until sharing with your other event has stopped", async () => {
    installFakeApi({ liveEvent: true, stopShareFails: 1 }).logIn();
    localStorage.setItem('eventbuddy_place', JSON.stringify(ATLANTA));
    localStorage.setItem('eventbuddy_share', JSON.stringify({ eventId: '1', until: HOUR_AHEAD() }));
    renderAt('/map');
    await pin('Friend: Alex');

    fireEvent.click(screen.getByRole('button', { name: 'Share my location' }));
    fireEvent.click(screen.getByRole('button', { name: '1 hour' }));

    expect(await screen.findByText("Couldn't stop sharing with your other event first. Try again.")).toBeInTheDocument();
    expect(requests('PUT', '/api/events/5/live/share')).toHaveLength(0);
    expect(storedShare()).toMatchObject({ eventId: '1' });
  });

  it('stops sharing when you log out', async () => {
    await alreadySharing();
    renderAt('/profile');
    await waitFor(() => expect(report).toBeDefined());

    fireEvent.click(await screen.findByRole('button', { name: /Log out/ }));

    await screen.findByLabelText('Email');
    expect(requests('DELETE', '/api/events/5/live/share')).toHaveLength(1);
    expect(geolocation.clearWatch).toHaveBeenCalledWith(3);
    expect(storedShare()).toBeNull();
  });
});

describe('eventDays', () => {
  const TODAY = '2026-10-25';

  it("covers an event that hasn't started, from its first day to its last", () => {
    expect(eventDays({ startDate: '2026-11-13', endDate: '2026-11-15' }, TODAY)).toEqual({ from: '2026-11-13', to: '2026-11-15' });
  });

  it('starts from today once the event is on', () => {
    expect(eventDays({ startDate: '2026-10-24', endDate: '2026-10-26' }, TODAY)).toEqual({ from: TODAY, to: '2026-10-26' });
  });

  it('stops at 31 days, the longest search', () => {
    expect(eventDays({ startDate: '2026-11-01', endDate: '2027-01-31' }, TODAY)).toEqual({ from: '2026-11-01', to: '2026-12-02' });
  });

  it('is nothing once the event is over', () => {
    expect(eventDays({ startDate: '2026-08-08', endDate: '2026-08-08' }, TODAY)).toBeNull();
  });
});
