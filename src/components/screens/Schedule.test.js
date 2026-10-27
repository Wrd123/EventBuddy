import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi, changeEvent, removeEvent, holdNext } from '../../testUtils/fakeApi';
import MainLayout from '../layout/MainLayout';

beforeEach(() => {
  localStorage.clear();
  installFakeApi().logIn();
});

const openSchedule = async () => {
  render(
    <MemoryRouter initialEntries={['/events/1/schedule']}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );
  await screen.findByText('Arctic Monkeys');
};

// The card for a schedule item, found by its activity name
const card = (activity) => screen.getByText(activity).closest('.card');

const activities = () =>
  screen.getAllByText(/Arctic Monkeys|Tame Impala|Sound Check/).map((el) => el.textContent);

const fillForm = (fields) => {
  for (const [label, value] of Object.entries(fields)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
};

describe('Schedule', () => {
  it('lists the day by start time with times and who is going', async () => {
    await openSchedule();

    expect(activities()).toEqual(['Arctic Monkeys', 'Tame Impala']);
    expect(within(card('Arctic Monkeys')).getByText('2:00 PM – 3:30 PM')).toBeInTheDocument();
    expect(within(card('Arctic Monkeys')).getByText('1 going')).toBeInTheDocument();
    expect(within(card('Tame Impala')).getByText('No one going yet')).toBeInTheDocument();
  });

  it('toggles going on and off', async () => {
    await openSchedule();
    const tameImpala = () => card('Tame Impala');

    fireEvent.click(within(tameImpala()).getByRole('button', { name: 'Join' }));
    expect(await within(tameImpala()).findByRole('button', { name: 'Going' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(tameImpala()).getByText('1 going')).toBeInTheDocument();

    fireEvent.click(within(tameImpala()).getByRole('button', { name: 'Going' }));
    expect(await within(tameImpala()).findByRole('button', { name: 'Join' })).toBeInTheDocument();
    expect(within(tameImpala()).getByText('No one going yet')).toBeInTheDocument();
  });

  it('flips Going before the server answers', async () => {
    await openSchedule();
    const release = holdNext('PUT', '/events/1/schedule/s2/going');

    fireEvent.click(within(card('Tame Impala')).getByRole('button', { name: 'Join' }));

    expect(within(card('Tame Impala')).getByRole('button', { name: 'Going' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(card('Tame Impala')).getByText('1 going')).toBeInTheDocument();
    await release();
    expect(within(card('Tame Impala')).getByRole('button', { name: 'Going' })).toBeInTheDocument();
  });

  it('puts Going back and says so when the server refuses', async () => {
    installFakeApi({ goingError: "Couldn't update that." }).logIn();
    await openSchedule();

    fireEvent.click(within(card('Tame Impala')).getByRole('button', { name: 'Join' }));

    expect(await within(card('Tame Impala')).findByText("Couldn't update that.")).toBeInTheDocument();
    expect(within(card('Tame Impala')).getByRole('button', { name: 'Join' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(card('Tame Impala')).getByText('No one going yet')).toBeInTheDocument();
  });

  const goingCalls = () =>
    global.fetch.mock.calls
      .filter(([url]) => url.endsWith('/going'))
      .map(([url, opts]) => `${opts.method} ${url.split('/schedule/')[1]}`);

  it('sends one request at a time, and the last one carries the last state tapped', async () => {
    await openSchedule();
    const release = holdNext('PUT', '/events/1/schedule/s2/going');

    fireEvent.click(within(card('Tame Impala')).getByRole('button', { name: 'Join' }));
    fireEvent.click(within(card('Tame Impala')).getByRole('button', { name: 'Going' }));
    expect(within(card('Tame Impala')).getByRole('button', { name: 'Join' })).toBeInTheDocument();
    // The leave waits for the join to land rather than racing it
    expect(goingCalls()).toEqual(['PUT s2/going']);

    await release();
    await waitFor(() => expect(goingCalls()).toEqual(['PUT s2/going', 'DELETE s2/going']));
    expect(within(card('Tame Impala')).getByRole('button', { name: 'Join' })).toBeInTheDocument();
    expect(within(card('Tame Impala')).getByText('No one going yet')).toBeInTheDocument();
  });

  it('sends nothing extra for join, leave, join: it ends Going with one request', async () => {
    await openSchedule();
    const release = holdNext('PUT', '/events/1/schedule/s2/going');
    const tameImpala = () => card('Tame Impala');

    fireEvent.click(within(tameImpala()).getByRole('button', { name: 'Join' }));
    fireEvent.click(within(tameImpala()).getByRole('button', { name: 'Going' }));
    fireEvent.click(within(tameImpala()).getByRole('button', { name: 'Join' }));
    await release();

    expect(within(tameImpala()).getByRole('button', { name: 'Going' })).toBeInTheDocument();
    expect(goingCalls()).toEqual(['PUT s2/going']);
  });

  it("doesn't let one item's answer undo a tap on another", async () => {
    await openSchedule();
    const releaseA = holdNext('PUT', '/events/1/schedule/s2/going');
    const releaseB = holdNext('PUT', '/events/1/schedule/s1/going');

    fireEvent.click(within(card('Tame Impala')).getByRole('button', { name: 'Join' }));
    fireEvent.click(within(card('Arctic Monkeys')).getByRole('button', { name: 'Join' }));
    // Tame Impala's answer was sent before the second tap, so it has no sign of it
    await releaseA();

    expect(within(card('Arctic Monkeys')).getByRole('button', { name: 'Going' })).toBeInTheDocument();
    expect(within(card('Tame Impala')).getByRole('button', { name: 'Going' })).toBeInTheDocument();
    await releaseB();
    expect(within(card('Arctic Monkeys')).getByText('2 going')).toBeInTheDocument();
  });

  it('adds an item in start-time order', async () => {
    await openSchedule();

    fireEvent.click(screen.getByRole('button', { name: /Add to/ }));
    fillForm({ "What's happening": 'Sound Check', Starts: '15:00', 'Ends (optional)': '15:45' });
    fireEvent.click(screen.getByRole('button', { name: 'Add to schedule' }));

    expect(await screen.findByText('Sound Check')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(activities()).toEqual(['Arctic Monkeys', 'Sound Check', 'Tame Impala']);
  });

  it('explains a problem without sending the form', async () => {
    await openSchedule();
    const callsBefore = global.fetch.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /Add to/ }));
    fillForm({ "What's happening": 'Sound Check', Starts: '15:00', 'Ends (optional)': '14:00' });
    fireEvent.click(screen.getByRole('button', { name: 'Add to schedule' }));

    expect(screen.getByText('The end time must be after the start time.')).toBeInTheDocument();
    expect(global.fetch.mock.calls.length).toBe(callsBefore);
  });

  it('edits an item', async () => {
    await openSchedule();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Tame Impala' }));
    fillForm({ "What's happening": 'Tame Impala (moved)', Starts: '12:00', 'Ends (optional)': '13:00' });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Tame Impala (moved)')).toBeInTheDocument();
    expect(within(card('Tame Impala (moved)')).getByText('12:00 PM – 1:00 PM')).toBeInTheDocument();
  });

  it('asks before deleting an item', async () => {
    await openSchedule();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Tame Impala' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete from schedule' }));
    expect(screen.getByText('Tame Impala', { selector: 'div' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tap again to delete' }));
    await waitFor(() => expect(screen.queryByText('Tame Impala')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(activities()).toEqual(['Arctic Monkeys']);
  });
});

describe('Schedule while friends change things', () => {
  // What the screen's check every 15 seconds does, done now
  const checkForChanges = () => fireEvent(document, new Event('visibilitychange'));

  it('shows an item a friend added without a refresh', async () => {
    await openSchedule();
    changeEvent('1', (event) => {
      event.schedule.push({
        _id: 's9', date: '2027-04-15', startTime: '18:00', endTime: '19:00', activity: 'Sound Check', location: 'Tent', attendees: []
      });
    });

    checkForChanges();

    expect(await screen.findByText('Sound Check')).toBeInTheDocument();
  });

  it('says so when the event was deleted', async () => {
    await openSchedule();
    removeEvent('1');

    checkForChanges();

    expect(await screen.findByText('Event not found')).toBeInTheDocument();
  });

  it("doesn't let a slow check undo an item you just added", async () => {
    await openSchedule();
    const release = holdNext('GET', '/events/1');
    checkForChanges(); // answered before the add, but held up

    fireEvent.click(screen.getByRole('button', { name: /Add to/ }));
    fillForm({ "What's happening": 'Sound Check', Starts: '18:00' });
    fireEvent.click(screen.getByRole('button', { name: 'Add to schedule' }));
    await screen.findByText('Sound Check');
    await release();

    expect(screen.getByText('Sound Check')).toBeInTheDocument();
  });
});
