import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi } from '../../testUtils/fakeApi';
import { routerFuture } from '../../App';
import MainLayout from '../layout/MainLayout';

// Leaflet can't draw in jsdom, so the map is replaced by its pins as buttons.
// (No JSX in a jest.mock factory: it's hoisted above the imports.)
jest.mock('../map/MapCanvas', () => {
  const { createElement } = require('react');
  return ({ pins, selectedId, onSelect }) =>
    createElement('div', { 'data-testid': 'map' },
      pins.map(pin => createElement('button', {
        key: pin.id,
        'aria-label': `${pin.kind === 'mine' ? 'Your event' : 'Venue'}: ${pin.label}${pin.count > 1 ? ` (${pin.count})` : ''}`,
        'aria-pressed': pin.id === selectedId,
        onClick: () => onSelect(pin.id)
      }))
    );
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

  it('starts on an event when opened from it', async () => {
    renderAt('/events/1');

    fireEvent.click(await screen.findByRole('button', { name: 'Map' }));

    expect(await pin('Your event: Summer Music Festival')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Open event' })).toBeInTheDocument();
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
