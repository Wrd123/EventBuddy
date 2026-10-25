import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider, useAppContext } from './AppContext';
import { installFakeApi, holdNext, changeEvent, settle, demoUser } from '../testUtils/fakeApi';

// Shows the events list and offers the changes the tests make
const Probe = () => {
  const { events, isAuthenticated, updateEvent, deleteEvent, logout, login } = useAppContext();
  if (!isAuthenticated) {
    return (
      <div>
        <p>{events.length} events kept</p>
        <button onClick={() => login({ email: demoUser.email, password: 'password' })}>Log in</button>
      </div>
    );
  }
  return (
    <div>
      <ul aria-label="Events">
        {events.map((e) => <li key={e._id}>{e.name}</li>)}
      </ul>
      <button onClick={() => updateEvent('1', { name: 'Festival (edited here)' })}>Rename</button>
      <button onClick={() => deleteEvent('2')}>Delete hike</button>
      <button onClick={logout}>Log out</button>
    </div>
  );
};

const names = () => screen.queryAllByRole('listitem').map((li) => li.textContent);

// What a background refresh does every half minute, done now
const refreshInBackground = () => fireEvent(document, new Event('visibilitychange'));

const renderProbe = async () => {
  render(<AppProvider><Probe /></AppProvider>);
  await screen.findByText('Summer Music Festival');
};

beforeEach(() => {
  localStorage.clear();
  installFakeApi().logIn();
});

describe('keeping events fresh', () => {
  it('picks up a change a friend made', async () => {
    await renderProbe();
    changeEvent('1', (event) => { event.name = 'Festival (renamed by Alex)'; });

    refreshInBackground();

    expect(await screen.findByText('Festival (renamed by Alex)')).toBeInTheDocument();
  });

  it("doesn't let a slow refresh undo your own edit", async () => {
    await renderProbe();
    const release = holdNext('GET', '/events');
    refreshInBackground(); // answered with the old name, but held up

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await screen.findByText('Festival (edited here)');
    await release();

    expect(names()).toContain('Festival (edited here)');
    expect(names()).not.toContain('Summer Music Festival');
  });

  it("doesn't bring back an event you just deleted", async () => {
    await renderProbe();
    const release = holdNext('GET', '/events');
    refreshInBackground();

    fireEvent.click(screen.getByRole('button', { name: 'Delete hike' }));
    await waitFor(() => expect(names()).not.toContain('Hiking Trip'));
    await release();

    expect(names()).not.toContain('Hiking Trip');
  });

  it('ignores a refresh that lands after logging out', async () => {
    await renderProbe();
    const release = holdNext('GET', '/events');
    refreshInBackground();

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByRole('button', { name: 'Log in' });
    await release();

    expect(screen.getByText('0 events kept')).toBeInTheDocument();
  });

  it('ignores a refresh from before logging in again', async () => {
    await renderProbe();
    const release = holdNext('GET', '/events');
    refreshInBackground(); // the old session's read, held up

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    changeEvent('1', (event) => { event.name = 'Festival (newer)'; });
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    await screen.findByText('Festival (newer)');
    await release();
    await settle();

    expect(names()).toContain('Festival (newer)');
    expect(names()).not.toContain('Summer Music Festival');
  });
});
