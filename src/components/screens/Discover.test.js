import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi } from '../../testUtils/fakeApi';
import { routerFuture } from '../../App';
import MainLayout from '../layout/MainLayout';

const ATLANTA = { label: 'Atlanta, GA', lat: 33.75, lng: -84.39, source: 'search' };

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

const ARCTIC_MONKEYS_ART = 'https://s1.ticketm.net/dam/a/123/arctic-monkeys_16_9.jpg';

// EventArt's drawing, as opposed to icons like the row's chevron
const illustratedCover = (el) => el.querySelector('svg[viewBox="0 0 400 240"]');

const rememberPlace =(place = ATLANTA) => localStorage.setItem('eventbuddy_place', JSON.stringify(place));

// The /discover/events requests the app made, as URLSearchParams
const eventRequests = () =>
  global.fetch.mock.calls
    .map(([url]) => url)
    .filter(url => url.startsWith('/api/discover/events'))
    .map(url => new URLSearchParams(url.split('?')[1]));

const mockGeolocation = (impl) => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: jest.fn(impl) }
  });
};

beforeEach(() => {
  localStorage.clear();
});

describe('Discover without a location yet', () => {
  beforeEach(() => installFakeApi().logIn());

  it('asks where to look, then shows events near a typed ZIP code', async () => {
    renderAt('/discover');

    fireEvent.click(await screen.findByRole('button', { name: 'Choose a location' }));
    fireEvent.change(screen.getByLabelText('City or ZIP code'), { target: { value: '30030' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('Near Decatur, GA')).toBeInTheDocument();
    expect(await screen.findByText('Arctic Monkeys')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('eventbuddy_place'))).toMatchObject({ label: 'Decatur, GA', source: 'search' });
  });

  it('explains a place it cannot find', async () => {
    renderAt('/discover');

    fireEvent.click(await screen.findByRole('button', { name: 'Choose a location' }));
    fireEvent.change(screen.getByLabelText('City or ZIP code'), { target: { value: 'Nowheresville' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn\'t find "Nowheresville". Try a city name or ZIP code.');
  });

  it("uses the phone's location, sending only rounded coordinates", async () => {
    mockGeolocation((success) => success({ coords: { latitude: 33.748992, longitude: -84.387985 } }));
    renderAt('/discover');

    fireEvent.click(await screen.findByRole('button', { name: 'Choose a location' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use my current location' }));

    expect(await screen.findByText('Near Atlanta, GA')).toBeInTheDocument();
    const urls = global.fetch.mock.calls.map(([url]) => url).filter(url => url.startsWith('/api/discover/'));
    expect(urls.every(url => !url.includes('33.748992') && !url.includes('84.387985'))).toBe(true);
    expect(urls[0]).toContain('lat=33.75&lng=-84.39');
  });

  it('explains when location access is turned off', async () => {
    mockGeolocation((success, failure) => failure({ code: 1 }));
    renderAt('/discover');

    fireEvent.click(await screen.findByRole('button', { name: 'Choose a location' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use my current location' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Location is turned off for EventBuddy. Enter a city or ZIP code instead.');
  });
});

describe('Discover with a location', () => {
  beforeEach(() => {
    rememberPlace();
    installFakeApi().logIn();
  });

  it('lists upcoming events with date, time, venue and distance', async () => {
    renderAt('/discover');

    const card = (await screen.findByText('Arctic Monkeys')).closest('button');
    expect(card).toHaveTextContent('Fri, Nov 20, 2099 • 7:30 PM');
    expect(card).toHaveTextContent('State Farm Arena • Atlanta, GA • 4.3 mi');
    expect(screen.getByText('Event data from Ticketmaster')).toBeInTheDocument();
  });

  it("shows Ticketmaster artwork, or an illustrated cover when there isn't any", async () => {
    renderAt('/discover');

    const withArt = (await screen.findByText('Arctic Monkeys')).closest('button');
    expect(withArt.querySelector('img')).toHaveAttribute('src', ARCTIC_MONKEYS_ART);
    expect(illustratedCover(withArt)).toBeNull();

    const withoutArt = screen.getByText('Hamilton').closest('button');
    expect(withoutArt.querySelector('img')).toBeNull();
    expect(illustratedCover(withoutArt)).not.toBeNull();

    fireEvent.click(withArt);
    expect(screen.getByRole('dialog', { name: 'Arctic Monkeys' }).querySelector('img')).toHaveAttribute('src', ARCTIC_MONKEYS_ART);
  });

  it('falls back to the illustrated cover when artwork fails to load', async () => {
    renderAt('/discover');

    const card = (await screen.findByText('Arctic Monkeys')).closest('button');
    fireEvent.error(card.querySelector('img'));

    expect(card.querySelector('img')).toBeNull();
    expect(illustratedCover(card)).not.toBeNull();
  });

  it('filters by category and distance', async () => {
    renderAt('/discover');
    await screen.findByText('Arctic Monkeys');

    fireEvent.click(within(screen.getByRole('group', { name: 'Category' })).getByRole('button', { name: 'Sports' }));
    expect(await screen.findByText('Atlanta Hawks vs. Boston Celtics')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Arctic Monkeys')).not.toBeInTheDocument());

    fireEvent.click(within(screen.getByRole('group', { name: 'Distance' })).getByRole('button', { name: '50 mi' }));
    await waitFor(() => expect(eventRequests().at(-1).get('radius')).toBe('50'));
    expect(eventRequests().at(-1).get('category')).toBe('sports');
  });

  it('narrows the list by name or venue', async () => {
    renderAt('/discover');
    await screen.findByText('Arctic Monkeys');

    fireEvent.change(screen.getByLabelText('Filter these events'), { target: { value: 'fox' } });

    expect(screen.getByText('Hamilton')).toBeInTheDocument();
    expect(screen.queryByText('Arctic Monkeys')).not.toBeInTheDocument();
  });

  it('plans an event with friends from a listing', async () => {
    renderAt('/discover');

    fireEvent.click(await screen.findByText('Arctic Monkeys'));
    const sheet = screen.getByRole('dialog', { name: 'Arctic Monkeys' });
    expect(within(sheet).getByRole('link', { name: /Get tickets/ })).toHaveAttribute('href', 'https://www.ticketmaster.com/event/1');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Plan with friends' }));

    // The new event opens with the invite sheet, ready to share
    expect(await screen.findByRole('heading', { level: 1, name: 'Arctic Monkeys' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Invite friends' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Get tickets/ })[0]).toHaveAttribute('href', 'https://www.ticketmaster.com/event/1');

    const created = global.fetch.mock.calls.find(([url, opts]) => url === '/api/events' && opts?.method === 'POST');
    expect(JSON.parse(created[1].body)).toEqual({
      name: 'Arctic Monkeys',
      type: 'concert',
      startDate: '2099-11-20',
      endDate: '2099-11-20',
      location: 'State Farm Arena, Atlanta, GA',
      ticketUrl: 'https://www.ticketmaster.com/event/1'
    });
  });

  it('lets you change the location', async () => {
    renderAt('/discover');
    await screen.findByText('Near Atlanta, GA');

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.change(screen.getByLabelText('City or ZIP code'), { target: { value: '30030' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('Near Decatur, GA')).toBeInTheDocument();
  });
});

describe('Discover edge cases', () => {
  beforeEach(() => rememberPlace());

  it('suggests searching farther when nothing is nearby', async () => {
    installFakeApi({ noLocalEvents: true }).logIn();
    renderAt('/discover');

    expect(await screen.findByText('Nothing within 25 miles')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search farther' }));
    await waitFor(() => expect(eventRequests().at(-1).get('radius')).toBe('50'));
  });

  it("shows the server's message when events can't load", async () => {
    installFakeApi({ discoverError: "Local events aren't set up yet. Add a Ticketmaster API key on the server." }).logIn();
    renderAt('/discover');

    expect(await screen.findByText("Couldn't load events")).toBeInTheDocument();
    expect(screen.getByText(/Add a Ticketmaster API key/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('Home suggestions', () => {
  it('shows real nearby events that open the same details', async () => {
    rememberPlace();
    installFakeApi().logIn();
    renderAt('/');

    fireEvent.click(await screen.findByRole('button', { name: 'See Arctic Monkeys' }));
    expect(screen.getByRole('dialog', { name: 'Arctic Monkeys' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change location, now near Atlanta, GA' })).toBeInTheDocument();
  });

  it('invites you to choose a location when none is set', async () => {
    installFakeApi().logIn();
    renderAt('/');

    expect(await screen.findByText('Find concerts, games and shows near you')).toBeInTheDocument();
    expect(eventRequests()).toHaveLength(0);
  });

  it('forgets the location on log out', async () => {
    rememberPlace();
    installFakeApi().logIn();
    renderAt('/profile');

    fireEvent.click(await screen.findByRole('button', { name: /Log Out/ }));

    await screen.findByLabelText('Email');
    expect(localStorage.getItem('eventbuddy_place')).toBeNull();
  });
});
