import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi, settle, changeEvent } from '../../testUtils/fakeApi';
import MainLayout from '../layout/MainLayout';

let fakeApi;

beforeEach(() => {
  localStorage.clear();
  fakeApi = installFakeApi();
});

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

const screenTitle = (name) => screen.findByRole('heading', { level: 1, name });

// Fills fields by their labels
const fill = (fields) => {
  for (const [label, value] of Object.entries(fields)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
};

describe('opening an invite link', () => {
  it('explains instead of offering to join, when the organizer removed you', async () => {
    fakeApi.logIn();
    changeEvent('3', (event) => { event.removed = [{ user: 'u1', name: 'John Doe' }]; });
    renderAt('/invite/game-code');

    // Found by its text: the loading outline is also a status until then
    const notice = await screen.findByText(/You were removed from this event/);
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent("You were removed from this event. Ask the organizer if you think that's a mistake.");
    expect(screen.queryByRole('button', { name: 'Join event' })).not.toBeInTheDocument();
  });

  it('shows the event and joins it with one tap', async () => {
    fakeApi.logIn();
    renderAt('/invite/game-code');

    expect(await screen.findByText('Taylor invited you to')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Game Night' })).toBeInTheDocument();
    expect(screen.getByText('Fri, Dec 4, 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Join event' }));

    expect(await screenTitle('Game Night')).toBeInTheDocument();
    // You're now in Who's going (first names there)
    expect(screen.getByText('John')).toBeInTheDocument();
    await settle();
  });

  it('adds the joined event to the Home list', async () => {
    fakeApi.logIn();
    renderAt('/invite/game-code');

    fireEvent.click(await screen.findByRole('button', { name: 'Join event' }));
    await screenTitle('Game Night');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('heading', { name: /Hey John/ })).toBeInTheDocument();
    expect(screen.getByText('Game Night')).toBeInTheDocument();
  });

  it('goes straight to the event for someone already in it', async () => {
    fakeApi.logIn();
    renderAt('/invite/festival-code');

    expect(await screenTitle('Summer Music Festival')).toBeInTheDocument();
    await settle();
  });

  it('explains an invalid link', async () => {
    fakeApi.logIn();
    renderAt('/invite/expired');

    expect(await screenTitle('Invite not found')).toBeInTheDocument();
    expect(screen.getByText("This invite link isn't valid anymore. Ask for a new one.")).toBeInTheDocument();
  });

  it('asks logged-out users to log in, then returns to the invite', async () => {
    renderAt('/invite/game-code');

    expect(await screen.findByText('Log in or sign up to see your invite.')).toBeInTheDocument();
    fill({ Email: 'user@example.com', Password: 'password' });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('button', { name: 'Join event' })).toBeInTheDocument();
  });

  it('returns new users to the invite after signing up', async () => {
    renderAt('/invite/game-code');

    fireEvent.click(await screen.findByRole('link', { name: 'Sign up' }));
    fill({
      Username: 'newfriend',
      Email: 'new@example.com',
      Password: 'secret123',
      'Confirm password': 'secret123'
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(await screen.findByRole('button', { name: 'Join event' })).toBeInTheDocument();
  });
});

describe('inviting from an event', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn(() => Promise.resolve()) } });
  });

  const openInviteSheet = async () => {
    fakeApi.logIn();
    renderAt('/events/1');
    fireEvent.click(await screen.findByRole('button', { name: 'Invite' }));
    return screen.getByRole('dialog');
  };

  it('shows and copies the invite link', async () => {
    const sheet = await openInviteSheet();
    const link = within(sheet).getByLabelText('Invite link');

    expect(link).toHaveValue('http://localhost/invite/festival-code');

    fireEvent.click(within(sheet).getByRole('button', { name: 'Copy link' }));
    expect(await within(sheet).findByText('Link copied')).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost/invite/festival-code');
  });

  it('lets the organizer reset the link after confirming', async () => {
    const sheet = await openInviteSheet();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Reset link' }));
    expect(within(sheet).getByLabelText('Invite link')).toHaveValue('http://localhost/invite/festival-code');

    fireEvent.click(within(sheet).getByRole('button', { name: /Tap again/ }));
    expect(await within(sheet).findByText('New link created. The old one no longer works.')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Invite link').value).toMatch(/\/invite\/reset-\d+$/);
  });

  it('opens right after creating an event', async () => {
    fakeApi.logIn();
    renderAt('/create');

    fireEvent.change(await screen.findByLabelText('Event name'), { target: { value: 'Brunch' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2099-05-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create event' }));

    expect(await screenTitle('Brunch')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Invite friends' })).toBeInTheDocument();
    await settle();
  });
});
