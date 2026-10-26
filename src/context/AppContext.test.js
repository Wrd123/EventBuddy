import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider, useAppContext } from './AppContext';
import { installFakeApi, holdNext, delayNext, changeEvent, serverEvent, settle, demoUser } from '../testUtils/fakeApi';

// Shows the events list and offers the changes the tests make
const Probe = () => {
  const { events, isAuthenticated, updateEvent, deleteEvent, createEvent, setGoing, logout, login } = useAppContext();
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
      <button onClick={() => createEvent({ name: 'Late night', startDate: '2027-01-01', endDate: '2027-01-01' })}>Create</button>
      <button onClick={() => setGoing('1', 's2', true).catch(() => {})}>Join Tame Impala</button>
      <button onClick={() => setGoing('1', 's2', false).catch(() => {})}>Leave Tame Impala</button>
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

describe('changes that land after the session ends', () => {
  it("doesn't add an event whose answer lands after logging out", async () => {
    await renderProbe();
    const release = holdNext('POST', '/events');

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByRole('button', { name: 'Log in' });
    await release();

    expect(screen.getByText('0 events kept')).toBeInTheDocument();
  });

  it("doesn't add it twice when the answer lands after logging in again", async () => {
    await renderProbe();
    const release = holdNext('POST', '/events');

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    // The server saved it, so the new session reads it once
    await screen.findByText('Late night');
    await release();
    await settle();

    expect(names().filter((name) => name === 'Late night')).toHaveLength(1);
  });

  it('stops sending Going taps once you log out', async () => {
    await renderProbe();
    // Join is a PUT and Leave a DELETE
    const goingRequests = () => global.fetch.mock.calls.filter(([url]) => url.endsWith('/s2/going'));
    const release = holdNext('PUT', '/events/1/schedule/s2/going');

    fireEvent.click(screen.getByRole('button', { name: 'Join Tame Impala' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave Tame Impala' })); // waits for the Join
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByRole('button', { name: 'Log in' });
    await release();
    await settle();

    // Without a login token, the queued Leave mustn't go out for the old user
    expect(goingRequests()).toHaveLength(1);
    expect(screen.getByText('0 events kept')).toBeInTheDocument();
  });
});

// Who's going to the festival's two plans, and Join/Leave for Tame Impala (s2)
const GoingProbe = () => {
  const { events, setGoing } = useAppContext();
  const [error, setError] = useState('');
  const festival = events.find((e) => e._id === '1');
  if (!festival) return <p>Loading</p>;
  const who = (itemId) => festival.schedule.find((i) => i._id === itemId).attendees.map((a) => a.name).join(', ') || 'nobody';
  const tap = (going) => setGoing('1', 's2', going).catch((err) => setError(err.message));
  return (
    <div>
      <p>Tame Impala: {who('s2')}</p>
      <p>Arctic Monkeys: {who('s1')}</p>
      {error && <p role="alert">{error}</p>}
      <button onClick={() => tap(true)}>Join</button>
      <button onClick={() => tap(false)}>Leave</button>
    </div>
  );
};

const GOING_PATH = '/events/1/schedule/s2/going';
const serverWho = (itemId) => serverEvent('1').schedule.find((i) => i._id === itemId).attendees.map((a) => a.name);
const shown = (text) => expect(screen.getByText(text)).toBeInTheDocument();

describe('Going while refreshes land', () => {
  const renderGoing = async () => {
    render(<AppProvider><GoingProbe /></AppProvider>);
    await screen.findByText('Tame Impala: nobody');
  };

  it('keeps your tap through a refresh that reaches the server first', async () => {
    await renderGoing();
    const release = delayNext('PUT', GOING_PATH);

    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    shown('Tame Impala: John Doe');
    refreshInBackground(); // the server doesn't have the tap yet
    await settle();
    shown('Tame Impala: John Doe');

    await release();
    await settle();
    shown('Tame Impala: John Doe');
    expect(serverWho('s2')).toEqual(['John Doe']);
  });

  it('ends on the last tap through join, leave, join with refreshes in between', async () => {
    await renderGoing();
    const release = delayNext('PUT', GOING_PATH);

    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    refreshInBackground();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    refreshInBackground();
    await settle();
    shown('Tame Impala: nobody');
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    refreshInBackground();
    await settle();
    shown('Tame Impala: John Doe');

    await release();
    await settle();
    shown('Tame Impala: John Doe');
    expect(serverWho('s2')).toEqual(['John Doe']);
    // One request carried it all: the taps only changed what was wanted
    expect(global.fetch.mock.calls.filter(([url]) => url.endsWith(GOING_PATH))).toHaveLength(1);
  });

  it("keeps a friend's attendance from a refresh that lands before the answer", async () => {
    await renderGoing();
    const release = holdNext('PUT', GOING_PATH); // applied, answer held up

    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    changeEvent('1', (event) => { event.schedule.find((i) => i._id === 's2').attendees.unshift({ user: 'u3', name: 'Taylor' }); });
    refreshInBackground();
    await screen.findByText('Tame Impala: Taylor, John Doe');

    await release();
    await settle();
    shown('Tame Impala: Taylor, John Doe');
  });

  it('shows changes to other plans while your tap is on its way', async () => {
    await renderGoing();
    const release = delayNext('PUT', GOING_PATH);

    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    changeEvent('1', (event) => { event.schedule.find((i) => i._id === 's1').attendees.push({ user: 'u3', name: 'Taylor' }); });
    refreshInBackground();
    await screen.findByText('Arctic Monkeys: Alex, Taylor');
    shown('Tame Impala: John Doe');

    await release();
    await settle();
    shown('Arctic Monkeys: Alex, Taylor');
    shown('Tame Impala: John Doe');
  });

  it('puts things back and says why when the server refuses', async () => {
    installFakeApi({ goingError: "Couldn't update that plan." }).logIn();
    await renderGoing();
    const release = delayNext('PUT', GOING_PATH);

    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    refreshInBackground();
    await settle();
    shown('Tame Impala: John Doe');

    await release();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update that plan.");
    shown('Tame Impala: nobody');
    // A refresh after the failure isn't laid over with the failed tap
    refreshInBackground();
    await settle();
    shown('Tame Impala: nobody');
    expect(serverWho('s2')).toEqual([]);
  });
});
