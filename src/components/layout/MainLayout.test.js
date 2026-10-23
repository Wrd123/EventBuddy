import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import * as authService from '../../services/authService';
import { routerFuture } from '../../App';
import MainLayout from './MainLayout';

// The mock services wait on setTimeout to simulate network latency. With fake
// timers, Testing Library's find* queries advance the clock while they wait.
beforeEach(() => {
  localStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const logIn = async () => {
  const promise = authService.login({ email: 'user@example.com', password: 'password' });
  jest.runAllTimers();
  await promise;
};

// Start the app at a URL, as if opened from a link or after a refresh
const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

// Timeouts are in fake time, so a generous one costs nothing. Logging in
// (1000ms) and then loading the event (300ms) exceeds the 1000ms default.
const eventTitle = (name) => screen.findByRole('heading', { level: 1, name }, { timeout: 5000 });

describe('routing', () => {
  it('sends logged-out users to the login screen', async () => {
    renderAt('/events/1');

    expect(await screen.findByText("Don't have an account?")).toBeInTheDocument();
  });

  it('opens an event straight from its URL', async () => {
    await logIn();
    renderAt('/events/1');

    expect(await eventTitle('Summer Music Festival')).toBeInTheDocument();
  });

  it('opens a sub-screen straight from its URL', async () => {
    await logIn();
    renderAt('/events/1/schedule');

    expect(await screen.findByText('Arctic Monkeys')).toBeInTheDocument();
  });

  it('shows Event not found for an unknown event id', async () => {
    await logIn();
    renderAt('/events/does-not-exist');

    expect(await eventTitle('Event not found')).toBeInTheDocument();
  });

  it('shows Page not found for an unknown URL', async () => {
    await logIn();
    renderAt('/no-such-page');

    expect(await eventTitle('Page not found')).toBeInTheDocument();
  });

  it('sends logged-in users away from the login screen', async () => {
    await logIn();
    renderAt('/login');

    expect(await screen.findByText('Your Events')).toBeInTheDocument();
  });

  it('returns to the requested page after logging in', async () => {
    renderAt('/events/2');

    fireEvent.change(await screen.findByPlaceholderText('your@email.com'), {
      target: { value: 'user@example.com' }
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await eventTitle('Hiking Trip')).toBeInTheDocument();
  });
});
