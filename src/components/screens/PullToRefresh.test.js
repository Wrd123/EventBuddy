import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi, changeEvent, receiveMessage, failNext, localEvents } from '../../testUtils/fakeApi';
import * as eventService from '../../services/eventService';
import { routerFuture } from '../../App';
import MainLayout from '../layout/MainLayout';

// A friend's change made on their phone, then a pull down on ours: the
// change shows right away, without waiting for the next background check.

const open = (path) =>
  render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

// The scrolling area a pull is bound to, found from something inside it
const scroller = (inside) => inside.closest('.overscroll-y-contain');

// A drag from the top of the list, far enough down to refresh
const pullDown = (el) => {
  fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 100 }] });
  fireEvent.touchMove(el, { touches: [{ clientX: 100, clientY: 300 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 100, clientY: 300 }] });
};

beforeEach(() => {
  localStorage.clear();
  installFakeApi().logIn();
});

afterEach(() => {
  localEvents.splice(3);
  delete navigator.geolocation;
});

describe('pull to refresh', () => {
  it("shows a friend's change to your events on Home", async () => {
    open('/');
    const greeting = await screen.findByRole('heading', { name: /^Hey John/ });
    await screen.findByText('Summer Music Festival');
    changeEvent('1', (event) => { event.name = 'Festival (renamed by Alex)'; });

    pullDown(scroller(greeting));

    expect(await screen.findByText('Festival (renamed by Alex)')).toBeInTheDocument();
  });

  it('shows a new unread message in Chats', async () => {
    open('/groups');
    expect(await screen.findByRole('button', { name: 'Summer Music Festival, 2 unread' })).toBeInTheDocument();
    receiveMessage('1', { text: 'Anyone there?' });

    pullDown(scroller(screen.getByText('Summer Music Festival')));

    expect(await screen.findByRole('button', { name: 'Summer Music Festival, 3 unread' })).toBeInTheDocument();
  });

  it("shows a friend's new unread message on the event page", async () => {
    open('/events/1');
    const chat = await screen.findByRole('button', { name: 'Chat, 2 unread' });
    receiveMessage('1', { text: 'Anyone there?' });

    pullDown(scroller(chat));

    expect(await screen.findByRole('button', { name: 'Chat, 3 unread' })).toBeInTheDocument();
  });

  it("shows a friend's new schedule item", async () => {
    open('/events/1/schedule');
    const first = await screen.findByText('Arctic Monkeys');
    changeEvent('1', (event) => {
      event.schedule.push({ _id: 's9', date: '2027-04-15', startTime: '18:00', endTime: '19:00', activity: 'Sound Check', location: 'Main Stage', attendees: [] });
    });

    pullDown(scroller(first));

    expect(await screen.findByText('Sound Check')).toBeInTheDocument();
  });

  it("shows a friend's new expense", async () => {
    open('/events/1/expenses');
    const first = await screen.findByText('Airbnb');
    await eventService.addExpense('1', {
      description: 'Taxi',
      amountCents: 6000,
      date: '2027-03-02',
      paidBy: 'u2',
      splitType: 'equal',
      shares: [{ user: 'u1', amountCents: 3000 }, { user: 'u2', amountCents: 3000 }]
    });

    pullDown(scroller(first));

    expect(await screen.findByText('Taxi')).toBeInTheDocument();
  });

  it('shows new events on Discover', async () => {
    localStorage.setItem('eventbuddy_place', JSON.stringify({ label: 'Atlanta, GA', lat: 33.75, lng: -84.39, source: 'search' }));
    open('/discover');
    const first = await screen.findByText('Arctic Monkeys');
    localEvents.push({ ...localEvents[0], _id: 'tm_new', name: 'Added Show' });

    pullDown(scroller(first));

    expect(await screen.findByText('Added Show')).toBeInTheDocument();
  });

  it("says so and keeps what's on screen when the pull can't reach the server", async () => {
    open('/events/1/schedule');
    const first = await screen.findByText('Arctic Monkeys');
    failNext('GET', '/events/1');

    pullDown(scroller(first));

    expect(await screen.findByText("Couldn't refresh. Check your connection.")).toBeInTheDocument();
    expect(screen.getByText('Arctic Monkeys')).toBeInTheDocument();
    expect(screen.getByText('Tame Impala')).toBeInTheDocument();
  });

  it('does the same on Home when your events can not be reached', async () => {
    open('/');
    const greeting = await screen.findByRole('heading', { name: /^Hey John/ });
    await screen.findByText('Summer Music Festival');
    failNext('GET', '/events');

    pullDown(scroller(greeting));

    expect(await screen.findByText("Couldn't refresh. Check your connection.")).toBeInTheDocument();
    expect(screen.getByText('Summer Music Festival')).toBeInTheDocument();
  });
});
