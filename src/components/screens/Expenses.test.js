import React from 'react';
import { render, renderHook, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi, holdNext, changeEvent, failNext } from '../../testUtils/fakeApi';
import * as eventService from '../../services/eventService';
import { useLedger } from './Expenses';
import MainLayout from '../layout/MainLayout';

// Event 1 starts with one expense: Alex paid a $300 Airbnb, split equally
// with John (the logged-in user), so John owes Alex $150. Budget: $500.
beforeEach(() => {
  localStorage.clear();
  installFakeApi().logIn();
});

const openExpenses = async () => {
  render(
    <MemoryRouter initialEntries={['/events/1/expenses']}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );
  await screen.findByText('Airbnb');
};

const NOTE = "Demo friends are simulated. At the picnic, they chat, move and add costs while you're here.";

const section = (title) => screen.getByRole('heading', { name: title }).closest('section');

const fillForm = (fields) => {
  for (const [label, value] of Object.entries(fields)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
};

describe('Expenses', () => {
  it("doesn't show the demo note to a real account", async () => {
    await openExpenses();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('shows the demo note to a demo account', async () => {
    installFakeApi({ demoAccount: true }).logIn();
    await openExpenses();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

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
    await within(section('Settle up')).findByText("Couldn't record your $150.00 payment to Alex. Try again.");
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
    // The payment is taken back out, so the row and the balance return
    expect(screen.getByText('You owe $150.00')).toBeInTheDocument();
    expect(screen.queryByText(/John Doe paid Alex/)).not.toBeInTheDocument();
    markPaid();

    expect(await screen.findByText('Everyone is settled up.')).toBeInTheDocument();
    const ids = global.fetch.mock.calls
      .filter(([url, opts = {}]) => url === '/api/events/1/payments' && opts.method === 'POST')
      .map(([, opts]) => JSON.parse(opts.body).clientId);
    expect(ids[1]).not.toBe(ids[0]);
  });

  it('updates the balance before the server answers, and shows the payment as saving', async () => {
    await openExpenses();
    const release = holdNext('POST', '/events/1/payments');

    fireEvent.click(within(section('Settle up')).getByRole('button', { name: 'Mark paid' }));

    expect(screen.getByText('Everyone is settled up.')).toBeInTheDocument();
    expect(screen.getByText("You're all even")).toBeInTheDocument();
    expect(within(section('Payments')).getByText(/John Doe paid Alex/)).toHaveTextContent('Saving...');
    expect(within(section('Payments')).queryByRole('button')).not.toBeInTheDocument();

    await release();
    await waitFor(() => expect(within(section('Payments')).queryByText(/Saving/)).not.toBeInTheDocument());
    expect(within(section('Payments')).getAllByText(/John Doe paid Alex/)).toHaveLength(1);
    expect(screen.getByText('Everyone is settled up.')).toBeInTheDocument();
  });

  const postedPayments = () =>
    global.fetch.mock.calls
      .filter(([url, opts = {}]) => url === '/api/events/1/payments' && opts.method === 'POST')
      .map(([, opts]) => JSON.parse(opts.body));
  const poll = () => act(async () => {
    fireEvent(document, new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('shows the server\'s own message when it gives a definite no', async () => {
    installFakeApi({ paymentOutcomes: [403] }).logIn();
    await openExpenses();

    fireEvent.click(within(section('Settle up')).getByRole('button', { name: 'Mark paid' }));

    expect(await within(section('Settle up')).findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.queryByText(/Couldn't record/)).not.toBeInTheDocument();
  });

  it("starts a new payment for a new debt of the same size, once the first has shown up", async () => {
    installFakeApi({ paymentOutcomes: ['lost'] }).logIn();
    await openExpenses();

    fireEvent.click(within(section('Settle up')).getByRole('button', { name: 'Mark paid' }));
    await within(section('Settle up')).findByText(/Couldn't record your \$150.00 payment to Alex/);
    // The lost payment was saved after all, and the next read shows it
    await poll();
    expect(await screen.findByText('Everyone is settled up.')).toBeInTheDocument();

    // Alex pays for another $300 split with John: John owes $150 again
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    fillForm({ 'What was it for': 'Dinner', 'Amount ($)': '300', 'Paid by': 'u2' });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add expense' }));
    await screen.findByText('Dinner');
    fireEvent.click(await within(section('Settle up')).findByRole('button', { name: 'Mark paid' }));

    await waitFor(() => expect(postedPayments()).toHaveLength(2));
    expect(postedPayments()[1].clientId).not.toBe(postedPayments()[0].clientId);
    expect(await screen.findByText('Everyone is settled up.')).toBeInTheDocument();
    expect(within(section('Payments')).getAllByText(/John Doe paid Alex/)).toHaveLength(2);
  });

  it("keeps one row's retry when a different payment goes through", async () => {
    installFakeApi({ paymentOutcomes: [500] }).logIn();
    changeEvent('1', (event) => event.members.push({ _id: 'm3', user: 'u3', name: 'Taylor', color: '#10b981' }));
    await openExpenses();
    // Taylor paid $90 for all three: John owes Alex $120 and Taylor $60
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    fillForm({ 'What was it for': 'Taxi', 'Amount ($)': '90', 'Paid by': 'u3' });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add expense' }));
    await screen.findByText('Taxi');
    const rowFor = (text) => within(section('Settle up')).getByText(text).closest('li');
    const markPaid = (text) => fireEvent.click(within(rowFor(text)).getByRole('button', { name: 'Mark paid' }));

    markPaid(/You pay Alex/);
    await within(section('Settle up')).findByText(/Couldn't record your \$120.00 payment to Alex/);
    markPaid(/You pay Taylor/);
    await waitFor(() => expect(postedPayments()).toHaveLength(2));
    await waitFor(() => expect(within(section('Settle up')).queryByText(/You pay Taylor/)).not.toBeInTheDocument());

    markPaid(/You pay Alex/);
    await waitFor(() => expect(postedPayments()).toHaveLength(3));
    expect(postedPayments()[2].clientId).toBe(postedPayments()[0].clientId);
  });

  it("doesn't lose or double count a pending payment when a read lands", async () => {
    await openExpenses();
    // A read that started before the tap, answering without the payment
    const releaseRead = holdNext('GET', '/events/1/expenses');
    await poll();
    const releasePost = holdNext('POST', '/events/1/payments');

    fireEvent.click(within(section('Settle up')).getByRole('button', { name: 'Mark paid' }));
    await releaseRead();
    expect(screen.getByText('Everyone is settled up.')).toBeInTheDocument();
    expect(within(section('Payments')).getAllByText(/John Doe paid Alex/)).toHaveLength(1);

    // A read after the tap that already includes the payment the server saved
    await poll();
    expect(screen.getByText('Everyone is settled up.')).toBeInTheDocument();
    expect(within(section('Payments')).getAllByText(/John Doe paid Alex/)).toHaveLength(1);

    await releasePost();
    await waitFor(() => expect(within(section('Payments')).queryByText(/Saving/)).not.toBeInTheDocument());
    expect(within(section('Payments')).getAllByText(/John Doe paid Alex/)).toHaveLength(1);
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

  describe('adding an expense that might not have saved', () => {
    const addDinner = (amount = '60') => {
      fillForm({ 'What was it for': 'Dinner', 'Amount ($)': amount });
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add expense' }));
    };
    const expensePosts = () => global.fetch.mock.calls
      .filter(([url, init]) => url.endsWith('/events/1/expenses') && init?.method === 'POST')
      .map(([, init]) => JSON.parse(init.body));

    it('retries with the same id, so the expense is added once', async () => {
      installFakeApi({ expenseOutcomes: ['lost'] }).logIn();
      await openExpenses();

      fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
      addDinner();
      expect(await screen.findByText("We couldn't confirm that saved. Try again; it won't be added twice.")).toBeInTheDocument();
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add expense' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(await screen.findByText('Dinner')).toBeInTheDocument();
      expect(screen.getAllByText('Dinner')).toHaveLength(1);
      const [first, retry] = expensePosts();
      expect(first.clientId).toBeTruthy();
      expect(retry.clientId).toBe(first.clientId);
    });

    it('explains that the first try saved when the retry was changed', async () => {
      installFakeApi({ expenseOutcomes: ['lost'] }).logIn();
      await openExpenses();

      fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
      addDinner();
      await screen.findByText(/We couldn't confirm that saved/);
      addDinner('70');

      expect(await screen.findByText('Your first try was saved. Close this to see it, and edit it there if anything changed.')).toBeInTheDocument();
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));

      expect(await screen.findByText('Dinner')).toBeInTheDocument();
      expect(screen.getByText('$360.00', { selector: 'span' })).toBeInTheDocument();
    });

    it('shows the saved expense when the sheet is closed instead of retried', async () => {
      installFakeApi({ expenseOutcomes: ['lost'] }).logIn();
      await openExpenses();

      fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
      addDinner();
      await screen.findByText(/We couldn't confirm that saved/);
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));

      expect(await screen.findByText('Dinner')).toBeInTheDocument();
    });

    it("shows the server's message when it gives a definite no", async () => {
      installFakeApi({ expenseOutcomes: [400] }).logIn();
      await openExpenses();

      fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
      addDinner();

      expect(await within(screen.getByRole('dialog')).findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });

    it('gives each new expense its own id', async () => {
      await openExpenses();

      for (let i = 0; i < 2; i += 1) {
        fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
        addDinner();
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      }

      expect(await screen.findAllByText('Dinner')).toHaveLength(2);
      const [first, second] = expensePosts();
      expect(second.clientId).not.toBe(first.clientId);
    });
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

describe('useLedger reload', () => {
  const openLedger = async () => {
    const seen = [];
    const hook = renderHook(() => {
      const value = useLedger('1');
      seen.push(value.status);
      return value;
    });
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return { ...hook, seen };
  };

  // A friend's $60 taxi, added from another phone
  const friendAddsTaxi = () =>
    eventService.addExpense('1', {
      description: 'Taxi',
      amountCents: 6000,
      date: '2027-03-02',
      paidBy: 'u2',
      splitType: 'equal',
      shares: [{ user: 'u1', amountCents: 3000 }, { user: 'u2', amountCents: 3000 }]
    });

  it('resolves with the friend\'s expense, without going back to loading', async () => {
    const { result, seen } = await openLedger();
    await friendAddsTaxi();

    await act(() => result.current.reload({ rethrow: true }));

    expect(result.current.expenses.map((e) => e.description)).toContain('Taxi');
    expect(seen.slice(seen.indexOf('ready'))).not.toContain('loading');
  });

  it('rejects for a pull when the server can not be reached, keeping the ledger', async () => {
    const { result } = await openLedger();
    failNext('GET', '/events/1/expenses');

    await act(async () => {
      await expect(result.current.reload({ rethrow: true })).rejects.toThrow();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.expenses.map((e) => e.description)).toEqual(['Airbnb']);
  });

  it('stays quiet when a poll fails', async () => {
    const { result } = await openLedger();
    failNext('GET', '/events/1/expenses');

    await act(() => result.current.reload());

    expect(result.current.status).toBe('ready');
    expect(result.current.expenses).toHaveLength(1);
  });
});
