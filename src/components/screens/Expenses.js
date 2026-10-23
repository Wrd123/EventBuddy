import React, { useState, useEffect, useCallback } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import Header from '../common/Header';
import { Button, ScreenLoader } from '../common';
import NotFound from './NotFound';
import ExpenseForm from './ExpenseForm';
import { useEvent } from '../../hooks/useEvent';
import { useAppContext } from '../../context/AppContext';
import * as eventService from '../../services/eventService';
import { computeBalances, settleUp } from '../../utils/ledger';
import { formatCents, parseDollars, centsToInput } from '../../utils/money';
import { formatDay, todayISO } from '../../utils/dates';

// The event's expenses and payments, reloaded after every change so the
// balances are always computed from what the server has
const useLedger = (eventId) => {
  const [ledger, setLedger] = useState({ status: 'loading', expenses: [], payments: [], error: '' });

  const reload = useCallback(async () => {
    try {
      const { expenses, payments } = await eventService.getLedger(eventId);
      setLedger({ status: 'ready', expenses, payments, error: '' });
    } catch (err) {
      setLedger(prev => ({ ...prev, status: 'error', error: err.message }));
    }
  }, [eventId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...ledger, reload };
};

const Expenses = () => {
  const { eventId } = useParams();
  const { event, status, error } = useEvent(eventId);
  const ledger = useLedger(eventId);
  const { currentUser } = useAppContext();
  // null (no form), 'new', or the expense being edited
  const [editing, setEditing] = useState(null);

  if (status === 'loading' || ledger.status === 'loading') return <ScreenLoader />;
  if (status === 'not-found') {
    return <NotFound title="Event not found" message="This event doesn't exist or was deleted." />;
  }
  if (status === 'error') return <NotFound title="Couldn't load event" message={error} />;
  if (ledger.status === 'error') return <NotFound title="Couldn't load expenses" message={ledger.error} />;

  const me = currentUser?._id;
  const isOrganizer = event.createdBy === me;
  const canChange = (record) => record.createdBy === me || isOrganizer;

  const balances = computeBalances(event.members, ledger.expenses, ledger.payments);
  const settlements = settleUp(balances);
  const totalCents = ledger.expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const myBalance = balances.find(b => b.user === me);

  return (
    <div className="flex flex-col h-full relative">
      <Header
        title="Group Expenses"
        type="screen"
        showBack={true}
        showProfile={false}
        showNotifications={false}
        backTo={`/events/${eventId}`}
      />

      <div className="p-4 flex-1 overflow-y-auto space-y-4">
        <Summary event={event} totalCents={totalCents} myBalance={myBalance} isOrganizer={isOrganizer} />

        <SettleUp event={event} settlements={settlements} me={me} onRecorded={ledger.reload} />

        {ledger.expenses.length > 0 && <Balances balances={balances} me={me} />}

        <section>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-medium">Expenses</h3>
            <button onClick={() => setEditing('new')} className="text-purple-600 text-sm font-medium flex items-center">
              <Plus size={16} className="mr-1" />
              Add Expense
            </button>
          </div>
          {ledger.expenses.length === 0 ? (
            <p className="text-sm text-gray-500">No expenses yet. Add the first one to start splitting costs.</p>
          ) : (
            <div className="flex flex-col space-y-3">
              {ledger.expenses.map(expense => (
                <ExpenseCard
                  key={expense._id}
                  expense={expense}
                  me={me}
                  onEdit={canChange(expense) ? () => setEditing(expense) : null}
                />
              ))}
            </div>
          )}
        </section>

        {ledger.payments.length > 0 && (
          <Payments event={event} payments={ledger.payments} canChange={canChange} onDeleted={ledger.reload} />
        )}
      </div>

      {editing && (
        <ExpenseForm
          event={event}
          expense={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            ledger.reload();
          }}
        />
      )}
    </div>
  );
};

const Summary = ({ event, totalCents, myBalance, isOrganizer }) => {
  const net = myBalance?.netCents ?? 0;
  const budget = event.budgetCents;
  const percentSpent = budget ? Math.min(100, (totalCents / budget) * 100) : 0;
  const overBudget = budget !== null && budget !== undefined && totalCents > budget;

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between mb-1">
        <span>Total spent</span>
        <span className="font-medium">{formatCents(totalCents)}</span>
      </div>

      {budget !== null && budget !== undefined && (
        <>
          <div className="flex justify-between mb-1 text-sm text-gray-600">
            <span>Budget {formatCents(budget)}</span>
            <span className={overBudget ? 'text-red-600 font-medium' : ''}>
              {overBudget ? `${formatCents(totalCents - budget)} over` : `${formatCents(budget - totalCents)} left`}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2" role="progressbar" aria-valuenow={Math.round(percentSpent)} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
            <div className={`h-2.5 rounded-full ${overBudget ? 'bg-red-500' : 'bg-purple-600'}`} style={{ width: `${percentSpent}%` }} />
          </div>
        </>
      )}

      {isOrganizer && <BudgetEditor event={event} />}

      <div className={`mt-2 font-medium ${net > 0 ? 'text-green-600' : net < 0 ? 'text-orange-600' : 'text-gray-600'}`}>
        {net > 0 && `You're owed ${formatCents(net)}`}
        {net < 0 && `You owe ${formatCents(-net)}`}
        {net === 0 && "You're all even"}
      </div>
    </div>
  );
};

// Organizer-only: set, change or remove the budget inline
const BudgetEditor = ({ event }) => {
  const { updateEvent } = useAppContext();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const open = () => {
    setValue(event.budgetCents ? centsToInput(event.budgetCents) : '');
    setError('');
    setIsEditing(true);
  };

  const save = async (budgetCents) => {
    try {
      await updateEvent(event._id, { budgetCents });
      setIsEditing(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim() === '') return save(null);
    const cents = parseDollars(value);
    if (cents === null) {
      setError('Enter a dollar amount, like 850 or 850.00.');
      return;
    }
    save(cents);
  };

  if (!isEditing) {
    return (
      <button onClick={open} className="text-sm text-purple-600 font-medium">
        {event.budgetCents !== null && event.budgetCents !== undefined ? 'Edit budget' : 'Set a budget'}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-1">
      <label htmlFor="budget" className="block text-sm text-gray-700 mb-1">Budget (leave empty for none)</label>
      <div className="flex space-x-2">
        <input id="budget" inputMode="decimal" className="flex-1 p-2 border border-gray-300 rounded-lg" placeholder="850.00" value={value} onChange={e => setValue(e.target.value)} />
        <Button type="submit" size="sm">Save</Button>
        <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
      </div>
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
    </form>
  );
};

const SettleUp = ({ event, settlements, me, onRecorded }) => (
  <section className="bg-white rounded-lg shadow p-4">
    <h3 className="font-medium mb-2">Settle up</h3>
    {settlements.length === 0 ? (
      <p className="text-sm text-gray-500">Everyone is settled up.</p>
    ) : (
      <ul className="space-y-2">
        {settlements.map(s => (
          <SettlementRow key={`${s.from.user}-${s.to.user}`} event={event} settlement={s} me={me} onRecorded={onRecorded} />
        ))}
      </ul>
    )}
  </section>
);

const SettlementRow = ({ event, settlement, me, onRecorded }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const { from, to, amountCents } = settlement;
  const involvesMe = from.user === me || to.user === me;

  const markPaid = async () => {
    setError('');
    setIsSaving(true);
    try {
      await eventService.recordPayment(event._id, { from: from.user, to: to.user, amountCents, date: todayISO() });
      await onRecorded();
    } catch (err) {
      setError(err.message);
      setIsSaving(false);
    }
  };

  const fromLabel = from.user === me ? 'You' : from.name;
  const toLabel = to.user === me ? 'you' : to.name;

  return (
    <li>
      <div className="flex items-center justify-between">
        <span className="text-sm">
          {fromLabel} {from.user === me ? 'pay' : 'pays'} {toLabel} <span className="font-medium">{formatCents(amountCents)}</span>
        </span>
        {involvesMe && (
          <button
            onClick={markPaid}
            disabled={isSaving}
            className="text-xs font-medium text-purple-600 border border-purple-600 px-3 py-1 rounded-full disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Mark paid'}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </li>
  );
};

const Balances = ({ balances, me }) => (
  <section className="bg-white rounded-lg shadow p-4">
    <h3 className="font-medium mb-2">Balances</h3>
    <ul className="space-y-1">
      {balances.map(b => (
        <li key={b.user} className="flex justify-between text-sm">
          <span>{b.user === me ? `${b.name} (you)` : b.name}</span>
          <span className={b.netCents > 0 ? 'text-green-600' : b.netCents < 0 ? 'text-orange-600' : 'text-gray-500'}>
            {b.netCents > 0 ? `gets back ${formatCents(b.netCents)}` : b.netCents < 0 ? `owes ${formatCents(-b.netCents)}` : 'even'}
          </span>
        </li>
      ))}
    </ul>
  </section>
);

const ExpenseCard = ({ expense, me, onEdit }) => {
  const myShare = expense.shares.find(s => s.user === me);
  const paidByMe = expense.paidBy.user === me;

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between mb-2">
        <div className="min-w-0">
          <h4 className="font-medium">{expense.description}</h4>
          <p className="text-sm text-gray-500">
            Paid by {paidByMe ? 'you' : expense.paidBy.name} · {formatDay(expense.date)}
          </p>
        </div>
        <div className="text-right shrink-0 ml-2">
          <div className="font-medium">{formatCents(expense.amountCents)}</div>
          {onEdit && (
            <button onClick={onEdit} className="text-gray-400 p-1 -mr-1" aria-label={`Edit ${expense.description}`}>
              <Pencil size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="flex justify-between items-center text-xs">
        <span className="bg-purple-100 text-purple-600 px-2 py-1 rounded">
          {expense.splitType === 'equal' ? `Split equally (${expense.shares.length})` : 'Exact amounts'}
        </span>
        {myShare && <span className="text-gray-600">Your share {formatCents(myShare.amountCents)}</span>}
      </div>
    </div>
  );
};

const Payments = ({ event, payments, canChange, onDeleted }) => {
  const [error, setError] = useState('');

  const remove = async (payment) => {
    setError('');
    try {
      await eventService.deletePayment(event._id, payment._id);
      await onDeleted();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section>
      <h3 className="font-medium mb-3">Payments</h3>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <ul className="space-y-2">
        {payments.map(p => (
          <li key={p._id} className="bg-white rounded-lg shadow px-4 py-3 flex justify-between items-center text-sm">
            <span>
              {p.from.name} paid {p.to.name} <span className="font-medium">{formatCents(p.amountCents)}</span>
              <span className="text-gray-500"> · {formatDay(p.date)}</span>
            </span>
            {canChange(p) && (
              <button onClick={() => remove(p)} className="text-gray-400 p-1" aria-label={`Delete payment from ${p.from.name} to ${p.to.name}`}>
                <X size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default Expenses;
