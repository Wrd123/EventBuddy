import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi } from '../../testUtils/fakeApi';
import { routerFuture } from '../../App';
import MainLayout from '../layout/MainLayout';

// Event 1 starts with one expense: Alex paid a $300 Airbnb, split equally
// with John (the logged-in user), so John owes Alex $150. Budget: $500.
beforeEach(() => {
  localStorage.clear();
  installFakeApi().logIn();
});

const openExpenses = async () => {
  render(
    <MemoryRouter initialEntries={['/events/1/expenses']} future={routerFuture}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );
  await screen.findByText('Airbnb');
};

const section = (title) => screen.getByRole('heading', { name: title }).closest('section');

const fillForm = (fields) => {
  for (const [label, value] of Object.entries(fields)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
};

describe('Expenses', () => {
  it('shows the total, budget, your balance and who pays whom', async () => {
    await openExpenses();

    expect(screen.getByText('$300.00', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Budget $500.00')).toBeInTheDocument();
    expect(screen.getByText('$200.00 left')).toBeInTheDocument();
    expect(screen.getByText('You owe $150.00')).toBeInTheDocument();
    expect(within(section('Settle up')).getByText(/You pay Alex/)).toHaveTextContent('You pay Alex $150.00');
    expect(screen.getByText('Your share $150.00')).toBeInTheDocument();
  });

  it('marks a payment as paid and evens everyone out', async () => {
    await openExpenses();

    fireEvent.click(within(section('Settle up')).getByRole('button', { name: 'Mark paid' }));

    expect(await screen.findByText('Everyone is settled up.')).toBeInTheDocument();
    expect(screen.getByText("You're all even")).toBeInTheDocument();
    expect(within(section('Payments')).getByText(/John Doe paid Alex/)).toHaveTextContent('John Doe paid Alex $150.00');
  });

  it('explains when the payment was already recorded, and shows where things stand', async () => {
    installFakeApi({ paymentOutcomes: [409] }).logIn();
    await openExpenses();

    fireEvent.click(within(section('Settle up')).getByRole('button', { name: 'Mark paid' }));

    expect(await within(section('Settle up')).findByRole('status'))
      .toHaveTextContent("That's already settled. Balances have been updated.");
    // It reloaded the ledger rather than leaving a stale "Mark paid" up
    expect(global.fetch.mock.calls.filter(([url, opts = {}]) =>
      url === '/api/events/1/expenses' && (opts.method || 'GET') === 'GET')).toHaveLength(2);

    // Still owed here, so the next tap goes ahead and the old notice goes
    fireEvent.click(within(section('Settle up')).getByRole('button', { name: 'Mark paid' }));
    expect(await screen.findByText('Everyone is settled up.')).toBeInTheDocument();
    expect(within(section('Settle up')).queryByRole('status')).not.toBeInTheDocument();
  });

  it('resends the same payment after a lost response, so it counts once', async () => {
    installFakeApi({ paymentOutcomes: ['lost'] }).logIn();
    await openExpenses();
    const markPaid = () => fireEvent.click(within(section('Settle up')).getByRole('button', { name: 'Mark paid' }));

    markPaid();
    await within(section('Settle up')).findByText(/Can't reach EventBuddy/);
    markPaid();

    expect(await screen.findByText('Everyone is settled up.')).toBeInTheDocument();
    const sent = global.fetch.mock.calls
      .filter(([url, opts = {}]) => url === '/api/events/1/payments' && opts.method === 'POST')
      .map(([, opts]) => JSON.parse(opts.body));
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(within(section('Payments')).getAllByText(/John Doe paid Alex/)).toHaveLength(1);
  });

  it('starts a new payment after one the server turned down', async () => {
    installFakeApi({ paymentOutcomes: [400] }).logIn();
    await openExpenses();
    const markPaid = () => fireEvent.click(within(section('Settle up')).getByRole('button', { name: 'Mark paid' }));

    markPaid();
    await within(section('Settle up')).findByText('Something went wrong. Please try again.');
    // The button is usable again
    markPaid();

    expect(await screen.findByText('Everyone is settled up.')).toBeInTheDocument();
    const ids = global.fetch.mock.calls
      .filter(([url, opts = {}]) => url === '/api/events/1/payments' && opts.method === 'POST')
      .map(([, opts]) => JSON.parse(opts.body).clientId);
    expect(ids[1]).not.toBe(ids[0]);
  });

  it('adds an expense split equally and updates balances', async () => {
    await openExpenses();

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    fillForm({ 'What was it for': 'Dinner', 'Amount ($)': '60' });
    expect(screen.getByText('$30.00 each')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add expense' }));

    expect(await screen.findByText('Dinner')).toBeInTheDocument();
    // Owed $150, then paid $60 of which $30 was Alex's: now owes $120
    expect(screen.getByText('You owe $120.00')).toBeInTheDocument();
    expect(screen.getByText('$360.00', { selector: 'span' })).toBeInTheDocument();
  });

  it('splits by exact amounts', async () => {
    await openExpenses();

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    fillForm({ 'What was it for': 'Tickets', 'Amount ($)': '100' });
    fireEvent.click(screen.getByRole('radio', { name: 'Exact amounts' }));
    fillForm({ 'John Doe': '70', Alex: '20' });
    expect(screen.getByText('$10.00 left to assign')).toBeInTheDocument();

    fillForm({ Alex: '30' });
    expect(screen.getByText('Adds up to the total')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add expense' }));

    expect(await screen.findByText('Tickets')).toBeInTheDocument();
    expect(screen.getByText('Your share $70.00')).toBeInTheDocument();
  });

  it("explains a split that doesn't add up without sending it", async () => {
    await openExpenses();
    const callsBefore = global.fetch.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    fillForm({ 'What was it for': 'Tickets', 'Amount ($)': '100' });
    fireEvent.click(screen.getByRole('radio', { name: 'Exact amounts' }));
    fillForm({ 'John Doe': '70' });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add expense' }));

    expect(screen.getByText('The amounts must add up to the total.')).toBeInTheDocument();
    expect(global.fetch.mock.calls.length).toBe(callsBefore);
  });

  it('rejects an amount it cannot read', async () => {
    await openExpenses();

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    fillForm({ 'What was it for': 'Dinner', 'Amount ($)': '12.345' });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add expense' }));

    expect(screen.getByText('Enter an amount like 42 or 42.50.')).toBeInTheDocument();
  });

  it('edits and deletes an expense', async () => {
    await openExpenses();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Airbnb' }));
    expect(screen.getByLabelText('Amount ($)')).toHaveValue('300.00');
    fillForm({ 'What was it for': 'Airbnb (2 nights)' });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Airbnb (2 nights)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Airbnb (2 nights)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete expense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to delete' }));

    await waitFor(() => expect(screen.queryByText('Airbnb (2 nights)')).not.toBeInTheDocument());
    expect(screen.getByText(/No expenses yet/)).toBeInTheDocument();
  });

  it('lets the organizer change the budget', async () => {
    await openExpenses();

    fireEvent.click(screen.getByRole('button', { name: 'Edit budget' }));
    fillForm({ 'Budget (leave empty for none)': '250' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Budget $250.00')).toBeInTheDocument();
    expect(screen.getByText('$50.00 over')).toBeInTheDocument();
  });
});
