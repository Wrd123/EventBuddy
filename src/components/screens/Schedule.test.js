import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi } from '../../testUtils/fakeApi';
import { routerFuture } from '../../App';
import MainLayout from '../layout/MainLayout';

beforeEach(() => {
  localStorage.clear();
  installFakeApi().logIn();
});

const openSchedule = async () => {
  render(
    <MemoryRouter initialEntries={['/events/1/schedule']} future={routerFuture}>
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
