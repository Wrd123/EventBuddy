import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi, holdNext } from '../../testUtils/fakeApi';
import { routerFuture } from '../../App';
import MainLayout from '../layout/MainLayout';

const open = (path) =>
  render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

// An event screen has nothing to show until both the events list and the
// event itself arrive (useEvent shows a copy already in the list at once),
// so hold both reads.
const holdEvent = (eventId) => {
  const releaseList = holdNext('GET', '/events');
  const releaseEvent = holdNext('GET', `/events/${eventId}`);
  return async () => {
    await releaseList();
    await releaseEvent();
  };
};

beforeEach(() => {
  localStorage.clear();
  installFakeApi().logIn();
});

// While a screen waits for data it keeps its real header, shows one labelled
// status for screen readers, and swaps to the content when the data lands.
describe('loading skeletons', () => {
  it('Home keeps its header and outlines the timeline', async () => {
    const release = holdNext('GET', '/events');
    open('/');

    expect(await screen.findByRole('status', { name: 'Loading your events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open profile' })).toBeInTheDocument();

    await release();
    expect(await screen.findByRole('button', { name: 'Open Hiking Trip' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading your events' })).not.toBeInTheDocument();
  });

  it('Chats keeps its header and outlines the rows', async () => {
    const release = holdNext('GET', '/chats');
    open('/groups');

    expect(await screen.findByRole('status', { name: /Loading/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chats' })).toBeInTheDocument();

    await release();
    expect(await screen.findByRole('button', { name: /Summer Music Festival/ })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /Loading/ })).not.toBeInTheDocument();
  });

  it('the event page keeps Back while it loads', async () => {
    const release = holdEvent('1');
    open('/events/1');

    expect(await screen.findByRole('status', { name: /Loading/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();

    await release();
    expect(await screen.findByRole('heading', { name: 'Summer Music Festival' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /Loading/ })).not.toBeInTheDocument();
  });

  it('Schedule keeps its header and Back while it loads', async () => {
    const release = holdEvent('1');
    open('/events/1/schedule');

    expect(await screen.findByRole('status', { name: /Loading/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();

    await release();
    expect(await screen.findByText('Arctic Monkeys')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /Loading/ })).not.toBeInTheDocument();
  });

  it('Expenses keeps its header and Back while it loads', async () => {
    const releaseEvent = holdEvent('1');
    const releaseLedger = holdNext('GET', '/events/1/expenses');
    open('/events/1/expenses');

    expect(await screen.findByRole('status', { name: /Loading/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Expenses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();

    await releaseEvent();
    // The event alone isn't enough: the ledger is still on its way
    expect(screen.getByRole('status', { name: /Loading/ })).toBeInTheDocument();

    await releaseLedger();
    expect(await screen.findByText('Airbnb')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /Loading/ })).not.toBeInTheDocument();
  });

  it('the chat keeps its header and Back while it loads', async () => {
    const releaseEvent = holdEvent('1');
    const releaseMessages = holdNext('GET', '/events/1/messages');
    open('/events/1/chat');

    expect(await screen.findByRole('status', { name: /Loading/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();

    await releaseEvent();
    await releaseMessages();
    expect(await screen.findByText("Who's bringing a charger?")).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /Loading/ })).not.toBeInTheDocument();
  });
});
