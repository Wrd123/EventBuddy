import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Copy, Pencil, Plus, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import Header from '../common/Header';
import { Button, ScreenLoader } from '../common';
import NotFound from './NotFound';
import ExpenseForm from './ExpenseForm';
import { useEvent, EVENT_POLL_MS } from '../../hooks/useEvent';
import { usePolling } from '../../hooks/usePolling';
import { useAppContext } from '../../context/AppContext';
import * as eventService from '../../services/eventService';
import { computeBalances, settleUp } from '../../utils/ledger';
import { formatCents, parseDollars, centsToInput } from '../../utils/money';
import { formatDay, todayISO } from '../../utils/dates';
import { payOptions } from '../../utils/payLinks';
import { newClientId, mightHaveSaved } from '../../utils/clientId';
import { createFreshness } from '../../utils/freshness';
import { success } from '../../services/haptics';

// The event's expenses and payments, reloaded after every change so the
// balances are always computed from what the server has, and every so often
// so friends' expenses and payments show up too. Also members' payment
// handles, as { userId: { venmo, cashapp, paypal, zelle } }.
const useLedger = (eventId) => {
  const [ledger, setLedger] = useState({ status: 'loading', expenses: [], payments: [], handles: {}, error: '' });
  // Every change here is followed by a reload, so a reload that started
  // earlier and lands later is the only stale case (see utils/freshness.js)
  const [freshness] = useState(createFreshness);

  const reload = useCallback(async () => {
    const read = freshness.start();
    try {
      const [{ expenses, payments }, handleList] = await Promise.all([
        eventService.getLedger(eventId),
        eventService.getPaymentHandles(eventId)
      ]);
      if (!freshness.accept(read)) return;
      const handles = Object.fromEntries(handleList.map(h => [h.user, h]));
      setLedger({ status: 'ready', expenses, payments, handles, error: '' });
    } catch (err) {
      if (!freshness.accept(read)) return;
      // A failed background check keeps the ledger on screen
      setLedger(prev => (prev.status === 'ready' ? prev : { ...prev, status: 'error', error: err.message }));
    }
  }, [eventId, freshness]);

  useEffect(() => {
    reload();
  }, [reload]);
  usePolling(reload, EVENT_POLL_MS);

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
        title="Expenses"
        subtitle={event.name}
        type="screen"
        showBack={true}
        showProfile={false}
        backTo={`/events/${eventId}`}
      />

      <div className="p-4 flex-1 overflow-y-auto space-y-4">
        <Summary event={event} totalCents={totalCents} myBalance={myBalance} isOrganizer={isOrganizer} />

        <SettleUp
          event={event}
          settlements={settlements}
          me={me}
          handles={ledger.handles}
          myHandles={currentUser?.paymentHandles}
          onRecorded={ledger.reload}
        />

        {ledger.expenses.length > 0 && <Balances balances={balances} me={me} />}

        <section>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-medium">Expenses</h3>
            <button onClick={() => setEditing('new')} className="tap text-accent-soft text-sm font-medium flex items-center">
              <Plus size={16} className="mr-1" />
              Add expense
            </button>
          </div>
          {ledger.expenses.length === 0 ? (
            <p className="text-sm text-muted">No expenses yet. Add the first one to start splitting costs.</p>
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
    <div className="card p-4">
      <div className="flex justify-between mb-1">
        <span>Total spent</span>
        <span className="font-medium">{formatCents(totalCents)}</span>
      </div>

      {budget !== null && budget !== undefined && (
        <>
          <div className="flex justify-between mb-1 text-sm text-muted">
            <span>Budget {formatCents(budget)}</span>
            <span className={overBudget ? 'text-red-400 font-medium' : ''}>
              {overBudget ? `${formatCents(totalCents - budget)} over` : `${formatCents(budget - totalCents)} left`}
            </span>
          </div>
          <div className="w-full bg-raised rounded-full h-2.5 mb-2" role="progressbar" aria-valuenow={Math.round(percentSpent)} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
            <div className={`h-2.5 rounded-full ${overBudget ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${percentSpent}%` }} />
          </div>
        </>
      )}

      {isOrganizer && <BudgetEditor event={event} />}

      <div className={`mt-2 font-medium ${net > 0 ? 'text-go' : net < 0 ? 'text-orange-400' : 'text-muted'}`}>
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
      <button onClick={open} className="tap text-sm text-accent-soft font-medium">
        {event.budgetCents !== null && event.budgetCents !== undefined ? 'Edit budget' : 'Set a budget'}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-1">
      <label htmlFor="budget" className="block text-sm text-fg/80 mb-1">Budget (leave empty for none)</label>
      <div className="flex space-x-2">
        <input id="budget" inputMode="decimal" className="flex-1 p-2 border border-line rounded-xl" placeholder="850.00" value={value} onChange={e => setValue(e.target.value)} />
        <Button type="submit" size="sm">Save</Button>
        <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
      </div>
      {error && <p className="text-sm text-red-400 mt-1">{error}</p>}
    </form>
  );
};

const hasAnyHandle = (handles) =>
  Boolean(handles && (handles.venmo || handles.cashapp || handles.paypal || handles.zelle));

const SettleUp = ({ event, settlements, me, handles, myHandles, onRecorded }) => {
  // Someone owes me, but I haven't said how to pay me
  const needsMyHandles = settlements.some(s => s.to.user === me) && !hasAnyHandle(myHandles);
  const [notice, setNotice] = useState('');
  const settledElsewhere = async (message) => {
    setNotice(message);
    await onRecorded();
  };

  return (
    <section className="card p-4">
      <h3 className="font-medium mb-2">Settle up</h3>
      {notice && <p className="text-sm text-muted mb-2" role="status">{notice}</p>}
      {settlements.length === 0 ? (
        <p className="text-sm text-muted">Everyone is settled up.</p>
      ) : (
        <ul className="space-y-3">
          {settlements.map(s => (
            <SettlementRow
              key={`${s.from.user}-${s.to.user}`}
              event={event}
              settlement={s}
              me={me}
              recipientHandles={handles[s.to.user]}
              onRecorded={onRecorded}
              onSettledElsewhere={settledElsewhere}
              onMarkPaid={() => setNotice('')}
            />
          ))}
        </ul>
      )}
      {needsMyHandles && (
        <p className="text-sm text-muted mt-3">
          <Link to="/profile" className="text-accent-soft font-medium">Add your Venmo, Cash App, PayPal or Zelle</Link>
          {' '}so friends can pay you back.
        </p>
      )}
    </section>
  );
};

const SettlementRow = ({ event, settlement, me, recipientHandles, onRecorded, onSettledElsewhere, onMarkPaid }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  // Set once a pay link is opened, to nudge recording the payment
  const [openedPayLink, setOpenedPayLink] = useState(false);
  const { from, to, amountCents } = settlement;
  const involvesMe = from.user === me || to.user === me;
  const iOwe = from.user === me;

  // The last try that might have been saved without us hearing back. Tapping
  // again resends it as is, with the same clientId, so the server saves it
  // at most once. Anything else (a new amount, or the last try clearly
  // worked or clearly failed) is a new payment with a new id.
  const uncertain = useRef(null);

  const markPaid = async () => {
    setError('');
    onMarkPaid();
    setIsSaving(true);
    const last = uncertain.current;
    const isRetry = last && last.from === from.user && last.to === to.user && last.amountCents === amountCents;
    const attempt = isRetry ? last : { clientId: newClientId(), from: from.user, to: to.user, amountCents, date: todayISO() };
    try {
      await eventService.recordPayment(event._id, attempt);
      uncertain.current = null;
      success();
      await onRecorded();
    } catch (err) {
      uncertain.current = mightHaveSaved(err) ? attempt : null;
      // Someone else already recorded it: show where things stand now. The
      // section says so, since this row may be gone once it reloads.
      if (err.status === 409) await onSettledElsewhere(err.message);
      else setError(err.message);
    } finally {
      // The row is keyed by who pays whom, so it can stay on screen with a
      // new amount and needs its button back
      setIsSaving(false);
    }
  };

  const fromLabel = from.user === me ? 'You' : from.name;
  const toLabel = to.user === me ? 'you' : to.name;

  return (
    <li>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm min-w-0">
          {fromLabel} {from.user === me ? 'pay' : 'pays'} {toLabel} <span className="font-medium">{formatCents(amountCents)}</span>
        </span>
        {involvesMe && (
          <button
            onClick={markPaid}
            disabled={isSaving}
            className="tap shrink-0 h-10 px-4 text-sm font-medium text-accent-soft border border-accent rounded-full disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Mark paid'}
          </button>
        )}
      </div>
      {iOwe && (
        <PayWith
          recipient={to}
          handles={recipientHandles}
          amountCents={amountCents}
          note={`EventBuddy · ${event.name}`}
          onOpened={() => setOpenedPayLink(true)}
        />
      )}
      {openedPayLink && (
        <p className="text-xs text-accent-soft mt-1">Sent it? Tap Mark paid so everyone's balances update.</p>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </li>
  );
};

// Buttons that open the recipient's payment app with the amount filled in.
// The money moves in that app; EventBuddy only records it via Mark paid.
const PayWith = ({ recipient, handles, amountCents, note, onOpened }) => {
  const [showZelle, setShowZelle] = useState(false);
  const [copied, setCopied] = useState(false);
  const options = payOptions(handles, amountCents, note);

  if (options.length === 0) {
    return <p className="text-xs text-muted mt-1">{recipient.name} hasn't added payment info yet.</p>;
  }

  const zelle = options.find(o => o.copy);
  const copyZelle = async () => {
    try {
      await navigator.clipboard.writeText(zelle.handle);
      setCopied(true);
    } catch {
      // Clipboard blocked: the address is on screen to select by hand
    }
  };

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        {options.map(option => option.copy ? (
          <button
            key={option.method}
            onClick={() => {
              setShowZelle(prev => !prev);
              onOpened();
            }}
            aria-expanded={showZelle}
            className="tap text-xs font-medium bg-raised text-fg px-3 py-1.5 rounded-full"
          >
            Zelle
          </button>
        ) : (
          <a
            key={option.method}
            href={option.url}
            // Web pages open in a new tab; an app link (venmo://) opens the
            // app directly, and a new tab would be left behind empty
            target={option.url.startsWith('http') ? '_blank' : undefined}
            rel="noopener noreferrer"
            onClick={onOpened}
            aria-label={`Pay ${recipient.name} ${formatCents(amountCents)} with ${option.label} (${option.handle})`}
            className="tap text-xs font-medium bg-fg text-night px-3 py-1.5 rounded-full"
          >
            {option.label}
          </a>
        ))}
      </div>

      {showZelle && zelle && (
        <div className="mt-2 bg-raised rounded-xl p-2 text-xs text-fg/80">
          <div className="flex items-center justify-between">
            <span className="font-medium break-all">{zelle.handle}</span>
            <button onClick={copyZelle} className="tap ml-2 flex items-center text-accent-soft font-medium shrink-0">
              <Copy size={14} className="mr-1" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-1">Open your bank's app, choose Zelle, and send {formatCents(amountCents)} to this address.</p>
        </div>
      )}

      <p className="text-xs text-muted mt-1">Check it's {recipient.name} before you pay.</p>
    </div>
  );
};

const Balances = ({ balances, me }) => (
  <section className="card p-4">
    <h3 className="font-medium mb-2">Balances</h3>
    <ul className="space-y-1">
      {balances.map(b => (
        <li key={b.user} className="flex justify-between text-sm">
          <span>{b.user === me ? `${b.name} (you)` : b.name}</span>
          <span className={b.netCents > 0 ? 'text-go' : b.netCents < 0 ? 'text-orange-400' : 'text-muted'}>
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
    <div className="card p-4">
      <div className="flex justify-between mb-2">
        <div className="min-w-0">
          <h4 className="font-medium">{expense.description}</h4>
          <p className="text-sm text-muted">
            Paid by {paidByMe ? 'you' : expense.paidBy.name} · {formatDay(expense.date)}
          </p>
        </div>
        <div className="text-right shrink-0 ml-2">
          <div className="font-medium">{formatCents(expense.amountCents)}</div>
          {onEdit && (
            <button onClick={onEdit} className="tap text-faint p-1 -mr-1" aria-label={`Edit ${expense.description}`}>
              <Pencil size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="flex justify-between items-center text-xs">
        <span className="bg-accent/15 text-accent-soft px-2 py-1 rounded">
          {expense.splitType === 'equal' ? `Split equally (${expense.shares.length})` : 'Exact amounts'}
        </span>
        {myShare && <span className="text-muted">Your share {formatCents(myShare.amountCents)}</span>}
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
      {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
      <ul className="space-y-2">
        {payments.map(p => (
          <li key={p._id} className="card px-4 py-3 flex justify-between items-center text-sm">
            <span>
              {p.from.name} paid {p.to.name} <span className="font-medium">{formatCents(p.amountCents)}</span>
              <span className="text-muted"> · {formatDay(p.date)}</span>
            </span>
            {canChange(p) && (
              <button onClick={() => remove(p)} className="tap text-faint p-1" aria-label={`Delete payment from ${p.from.name} to ${p.to.name}`}>
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
