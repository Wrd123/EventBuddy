import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi, settle, presence, openSockets, poke, addActivity, removeEvent, failNext } from '../../testUtils/fakeApi';
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

describe('recent activity', () => {
  const activitySection = () => screen.getByRole('heading', { name: 'Recent activity' }).closest('section');
  const sheet = () => screen.getByRole('dialog', { name: 'Activity' });

  // n lines by Alex in event 1, oldest first, with ids that sort like real ones
  const history = (n) => Array.from({ length: n }, (_, i) => ({
    _id: `a${String(i + 1).padStart(4, '0')}`,
    actor: { user: 'u2', name: 'Alex' },
    kind: 'schedule_added',
    data: { activity: `Plan ${i + 1}` },
    createdAt: new Date().toISOString()
  }));

  const subscribed = () => waitFor(() => expect(openSockets()[0]?.subscriptions.has('1')).toBe(true));

  it('shows the newest two lines, and the rest in a sheet', async () => {
    installFakeApi().logIn();
    renderAt('/events/1');

    await screen.findByText('Alex added Airbnb ($300.00)');
    const preview = within(activitySection());
    expect(preview.getAllByRole('listitem')).toHaveLength(2);
    expect(preview.getByText('Alex added Arctic Monkeys to the schedule')).toBeInTheDocument();
    expect(preview.queryByText('Alex joined')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'See all activity' }));
    expect(within(sheet()).getAllByRole('listitem')).toHaveLength(3);
    expect(within(sheet()).getByText('Alex joined')).toBeInTheDocument();
  });

  it('brings in what just happened as soon as the event changes', async () => {
    installFakeApi({ realtime: true }).logIn();
    renderAt('/events/1');
    await screen.findByText('Alex added Airbnb ($300.00)');
    await subscribed();

    addActivity('1', { kind: 'meetup_set' });
    await poke('1', 'event');

    expect(await within(activitySection()).findByText('Alex set the meetup point')).toBeInTheDocument();
    expect(within(activitySection()).queryByText('Alex added Arctic Monkeys to the schedule')).not.toBeInTheDocument();
  });

  it('shows a name with markup in it as plain text', async () => {
    installFakeApi({
      activity: { '1': [{ ...history(1)[0], actor: { user: 'u9', name: '<img src=x onerror=alert(1)>' }, kind: 'joined', data: {} }] }
    }).logIn();
    renderAt('/events/1');

    expect(await screen.findByText('<img src=x onerror=alert(1)> joined')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it("isn't there until something has happened", async () => {
    installFakeApi({ activity: {} }).logIn();
    renderAt('/events/1');
    await screen.findByRole('button', { name: 'Alex' });
    await settle();

    expect(screen.queryByRole('heading', { name: 'Recent activity' })).not.toBeInTheDocument();
  });

  it('keeps each preview line to one line, and lets the sheet wrap them', async () => {
    installFakeApi().logIn();
    renderAt('/events/1');
    expect(await screen.findByText('Alex added Airbnb ($300.00)')).toHaveClass('truncate');

    fireEvent.click(screen.getByRole('button', { name: 'See all activity' }));
    expect(within(sheet()).getByText('Alex added Airbnb ($300.00)')).toHaveClass('break-words');
  });

  it('pages back through older lines in the sheet', async () => {
    installFakeApi({ activity: { '1': history(25) } }).logIn();
    renderAt('/events/1');
    fireEvent.click(await screen.findByRole('button', { name: 'See all activity' }));
    expect(within(sheet()).getAllByRole('listitem')).toHaveLength(20);

    fireEvent.click(within(sheet()).getByRole('button', { name: 'Show earlier' }));
    expect(await within(sheet()).findByText('Alex added Plan 1 to the schedule')).toBeInTheDocument();
    expect(within(sheet()).getAllByRole('listitem')).toHaveLength(25);
    expect(within(sheet()).queryByRole('button', { name: 'Show earlier' })).not.toBeInTheDocument();
  });

  it('closes the sheet when you lose access to the event', async () => {
    installFakeApi({ realtime: true }).logIn();
    renderAt('/events/1');
    fireEvent.click(await screen.findByRole('button', { name: 'See all activity' }));
    await subscribed();

    removeEvent('1');
    await poke('1', 'event');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Event not found')).toBeInTheDocument();
    expect(screen.queryByText('Alex joined')).not.toBeInTheDocument();
  });

  it('closes the sheet as soon as the activity says you lost access, for good', async () => {
    installFakeApi({ realtime: true }).logIn();
    renderAt('/events/1');
    fireEvent.click(await screen.findByRole('button', { name: 'See all activity' }));
    await subscribed();

    // Only the activity read finds out; the event page hasn't yet
    failNext('GET', '/events/1/activity', 404);
    await poke('1', 'event');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: "Who's going" })).toBeInTheDocument();

    // The lines coming back doesn't open it again by itself
    await poke('1', 'event');
    expect(await screen.findByRole('heading', { name: 'Recent activity' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
