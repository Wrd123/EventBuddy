import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi } from '../../testUtils/fakeApi';
import { routerFuture } from '../../App';
import MainLayout from '../layout/MainLayout';

const renderHome = () =>
  render(
    <MemoryRouter initialEntries={['/']} future={routerFuture}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

const section = (name) => screen.getByRole('heading', { name }).closest('section');

beforeEach(() => {
  localStorage.clear();
});

describe('Home', () => {
  it('shows the soonest event once, as the big card, and the rest under Coming up', async () => {
    installFakeApi({ liveEvent: true }).logIn();
    renderHome();

    expect(await screen.findByRole('button', { name: 'Open Picnic in the Park' })).toBeInTheDocument();
    expect(screen.getByText('Happening now')).toBeInTheDocument();
    expect(screen.getAllByText('Picnic in the Park')).toHaveLength(1);

    const comingUp = within(section('Coming up'));
    expect(comingUp.getByText('Hiking Trip')).toBeInTheDocument();
    expect(comingUp.getByText('Summer Music Festival')).toBeInTheDocument();
  });

  it("says when the next event is without repeating its name", async () => {
    installFakeApi({ liveEvent: true }).logIn();
    renderHome();

    const greeting = await screen.findByRole('heading', { name: "Hey John, something's on right now." });
    expect(greeting).not.toHaveTextContent('Picnic in the Park');
  });

  it('counts the days to an upcoming event in the greeting', async () => {
    installFakeApi().logIn();
    renderHome();

    expect(await screen.findByRole('heading', { name: /^Hey John, (tomorrow's the day|your next plan is in \d+ days)\.$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^Hey John/ })).not.toHaveTextContent('Hiking Trip');
  });

  it('keeps the full distance as the marker text, and lets long titles wrap', async () => {
    installFakeApi({ liveEvent: true }).logIn();
    renderHome();

    await screen.findByText('Hiking Trip');
    // The compact visual is aria-hidden; the readable label is still there
    const comingUp = within(section('Coming up'));
    expect(comingUp.getAllByText(/^(Today|Tomorrow|\d+ days)$/).length).toBeGreaterThan(0);
    expect(screen.getByText('Now')).toBeInTheDocument();

    // Two lines, not one clipped line
    expect(comingUp.getByText('Hiking Trip')).toHaveClass('line-clamp-2');
    expect(comingUp.getByText('Hiking Trip')).not.toHaveClass('truncate');
    expect(screen.getByText('Picnic in the Park')).toHaveClass('line-clamp-2');
  });

  it('gives the date and the place their own lines in each row', async () => {
    installFakeApi({ liveEvent: true }).logIn();
    renderHome();

    await screen.findByText('Hiking Trip');
    const comingUp = within(section('Coming up'));
    const date = comingUp.getByText(/^Nov 13/);
    const place = comingUp.getByText('Smoky Mountains');
    expect(date).toHaveClass('truncate');
    expect(place).toHaveClass('truncate');
    expect(date).not.toContainElement(place);
  });

  it('keeps the header wordmark small', async () => {
    installFakeApi().logIn();
    renderHome();

    const title = await screen.findByRole('heading', { level: 1, name: 'EventBuddy' });
    expect(title.firstChild).toHaveClass('text-[19px]');
  });

  it('asks for a location in one place when none is set', async () => {
    installFakeApi().logIn();
    renderHome();

    await screen.findByText('Hiking Trip');
    expect(screen.getAllByText('Choose a location')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Change location/ })).not.toBeInTheDocument();
  });

  it('shows the chosen place above the suggestions from it', async () => {
    localStorage.setItem('eventbuddy_place', JSON.stringify({ label: 'Atlanta, GA', lat: 33.75, lng: -84.39, source: 'search' }));
    installFakeApi().logIn();
    renderHome();

    expect(await screen.findByText('Hiking Trip')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change location, now near Atlanta, GA' })).toBeInTheDocument();
    expect(await within(section('Suggested for you')).findByText('Arctic Monkeys')).toBeInTheDocument();
  });

  it("says when your events couldn't load, and tries again", async () => {
    installFakeApi({ eventsFailures: 1 }).logIn();
    renderHome();

    expect(await screen.findByText("Couldn't load your events")).toBeInTheDocument();
    expect(screen.queryByText('No upcoming events yet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Open Hiking Trip' })).toBeInTheDocument();
  });
});
