import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi, settle } from '../../testUtils/fakeApi';
import { routerFuture } from '../../App';
import MainLayout from './MainLayout';

let fakeApi;

beforeEach(() => {
  localStorage.clear();
  fakeApi = installFakeApi();
});

// Start the app at a URL, as if opened from a link or after a refresh
const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

const screenTitle = (name) => screen.findByRole('heading', { level: 1, name });

describe('routing', () => {
  it('sends logged-out users to the login screen', async () => {
    renderAt('/events/1');

    expect(await screen.findByText("New to EventBuddy?")).toBeInTheDocument();
  });

  it('opens an event straight from its URL', async () => {
    fakeApi.logIn();
    renderAt('/events/1');

    expect(await screenTitle('Summer Music Festival')).toBeInTheDocument();
    await settle();
  });

  it('opens a sub-screen straight from its URL', async () => {
    fakeApi.logIn();
    renderAt('/events/1/schedule');

    expect(await screen.findByText('Arctic Monkeys')).toBeInTheDocument();
    await settle();
  });

  it('shows Event not found for an unknown event id', async () => {
    fakeApi.logIn();
    renderAt('/events/does-not-exist');

    expect(await screenTitle('Event not found')).toBeInTheDocument();
  });

  it("shows Couldn't load event when the server is unreachable", async () => {
    fakeApi.logIn();
    global.fetch.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    renderAt('/events/1');

    expect(await screenTitle("Couldn't load event")).toBeInTheDocument();
  });

  it('shows Page not found for an unknown URL', async () => {
    fakeApi.logIn();
    renderAt('/no-such-page');

    expect(await screenTitle('Page not found')).toBeInTheDocument();
    await settle();
  });

  it('sends logged-in users away from the login screen', async () => {
    fakeApi.logIn();
    renderAt('/login');

    expect(await screen.findByRole('heading', { name: /Hey John/ })).toBeInTheDocument();
    await settle();
  });

  it('returns to the requested page after logging in', async () => {
    renderAt('/events/2');

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'user@example.com' }
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screenTitle('Hiking Trip')).toBeInTheDocument();
    await settle();
  });

  it("shows the server's message for a wrong password", async () => {
    renderAt('/login');

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'user@example.com' }
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrong' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
  });

  it('goes Home after logging back in, not to where you logged out', async () => {
    fakeApi.logIn();
    renderAt('/profile');

    fireEvent.click(await screen.findByRole('button', { name: /Log out/ }));
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'user@example.com' }
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('heading', { name: /Hey John/ })).toBeInTheDocument();
    await settle();
  });

  it('logs out when the server rejects a saved login', async () => {
    // A token from a previous session that the server no longer accepts
    localStorage.setItem('eventbuddy_token', 'expired-token');
    localStorage.setItem('eventbuddy_user', JSON.stringify({ name: 'John Doe' }));
    renderAt('/');

    expect(await screen.findByText("New to EventBuddy?")).toBeInTheDocument();
    expect(localStorage.getItem('eventbuddy_token')).toBeNull();
  });
});
