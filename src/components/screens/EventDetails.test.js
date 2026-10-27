import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi, settle, presence, openSockets } from '../../testUtils/fakeApi';
import MainLayout from '../layout/MainLayout';

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
});

describe('event page', () => {
  it('shows unread messages and your balance on the buttons', async () => {
    installFakeApi().logIn();
    renderAt('/events/1');

    expect(await screen.findByRole('button', { name: 'Chat, 2 unread' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expenses, Owe $150.00' })).toBeInTheDocument();
  });

  it('marks who organized the event', async () => {
    installFakeApi({ liveEvent: true }).logIn();
    renderAt('/events/5');

    const organizer = (await screen.findByText('Organizer')).closest('button');
    expect(organizer).toHaveTextContent('Taylor');
  });
});

describe("leaving and removing people", () => {
  const sheet = () => screen.getByRole('dialog');

  it('lets you leave an event someone else organizes', async () => {
    installFakeApi({ liveEvent: true }).logIn();
    renderAt('/events/5');

    fireEvent.click(await screen.findByRole('button', { name: 'John Doe' }));
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Leave event' }));
    // The first tap only asks
    expect(within(sheet()).getByText(/You'll lose access/)).toBeInTheDocument();
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Tap again to leave' }));

    // Home, without the event
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Picnic in the Park')).not.toBeInTheDocument();
    expect(global.fetch.mock.calls.some(([url, opts = {}]) =>
      url === '/api/events/5/members/u1' && opts.method === 'DELETE')).toBe(true);
    await settle();
  });

  it('explains when your balance has to be settled first', async () => {
    installFakeApi({ liveEvent: true, memberRemovalError: 'You still owe $20.00 in this event. Settle up first.' }).logIn();
    renderAt('/events/5');

    fireEvent.click(await screen.findByRole('button', { name: 'John Doe' }));
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Leave event' }));
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Tap again to leave' }));

    expect(await within(sheet()).findByRole('alert')).toHaveTextContent('You still owe $20.00 in this event. Settle up first.');
    expect(within(sheet()).getByRole('link', { name: 'Go to Expenses' })).toHaveAttribute('href', '/events/5/expenses');

    // Trying again asks again, without the old message hanging around
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Leave event' }));
    expect(within(sheet()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps your balance on the Expenses button up to date', async () => {
    installFakeApi().logIn();
    renderAt('/events/1');
    expect(await screen.findByRole('button', { name: 'Expenses, Owe $150.00' })).toBeInTheDocument();

    // Paid back from another screen or phone; the page checks again
    await global.fetch('/api/events/1/payments', {
      method: 'POST',
      headers: { Authorization: 'Bearer fake-token' },
      body: JSON.stringify({ from: 'u1', to: 'u2', amountCents: 15000, date: '2027-03-02' })
    });
    fireEvent(document, new Event('visibilitychange'));

    expect(await screen.findByRole('button', { name: 'Expenses, All settled' })).toBeInTheDocument();
  });

  it('lets the organizer remove someone, and nobody else', async () => {
    installFakeApi().logIn();
    renderAt('/events/1');

    fireEvent.click(await screen.findByRole('button', { name: 'Alex' }));
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Remove from event' }));
    expect(within(sheet()).getByText(/can't rejoin with the invite link/)).toBeInTheDocument();
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Tap again to remove Alex' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Alex' })).not.toBeInTheDocument();
    expect(screen.getByText('1 person')).toBeInTheDocument();
  });

  it("offers nothing on the organizer's card, or on others' cards for members", async () => {
    installFakeApi({ liveEvent: true }).logIn();
    renderAt('/events/5');

    fireEvent.click(await screen.findByRole('button', { name: 'Taylor, organizer' }));
    expect(within(sheet()).queryByRole('button', { name: /Leave|Remove/ })).not.toBeInTheDocument();
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'Alex' }));
    expect(within(sheet()).queryByRole('button', { name: /Leave|Remove/ })).not.toBeInTheDocument();
  });

  it("lets the organizer let a removed person back in from the invite sheet", async () => {
    installFakeApi().logIn();
    renderAt('/events/1');

    fireEvent.click(await screen.findByRole('button', { name: 'Alex' }));
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Remove from event' }));
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Tap again to remove Alex' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    const removed = await within(sheet()).findByRole('heading', { name: 'Removed' });
    fireEvent.click(within(removed.parentElement).getByRole('button', { name: 'Let back in' }));

    await waitFor(() => expect(within(sheet()).queryByRole('heading', { name: 'Removed' })).not.toBeInTheDocument());
  });
});

describe('who is here now', () => {
  it('puts a dot on the members who have the app open, and says so', async () => {
    installFakeApi({ realtime: true }).logIn();
    renderAt('/events/1');
    await screen.findByRole('button', { name: 'Alex' });
    await waitFor(() => expect(openSockets()[0]?.subscriptions.has('1')).toBe(true));

    // You're here too, but you know that
    await presence('1', ['u1', 'u2']);
    expect(screen.getByRole('button', { name: 'Alex, here now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^John Doe, organizer$/ })).toBeInTheDocument();

    await presence('1', ['u1']);
    expect(screen.getByRole('button', { name: 'Alex' })).toBeInTheDocument();
  });
});
