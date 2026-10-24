import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../common';
import { useAppContext } from '../../context/AppContext';
import * as eventService from '../../services/eventService';
import { formatCents, parseDollars, centsToInput, splitEqually } from '../../utils/money';
import { todayISO } from '../../utils/dates';

// Bottom sheet for adding (expense is null) or editing an expense.
// Splits equally among chosen members, or by exact amounts per person.
const ExpenseForm = ({ event, expense, onClose, onSaved }) => {
  const { currentUser } = useAppContext();
  const members = event.members;
  const shareFor = (user) => expense?.shares.find(s => s.user === user);

  const [fields, setFields] = useState({
    description: expense?.description ?? '',
    amount: expense ? centsToInput(expense.amountCents) : '',
    paidBy: expense?.paidBy.user ?? currentUser?._id ?? members[0].user,
    date: expense?.date ?? todayISO(),
    splitType: expense?.splitType ?? 'equal'
  });
  // Equal split: who's in it (everyone, for a new expense)
  const [included, setIncluded] = useState(
    () => new Set(expense ? expense.shares.map(s => s.user) : members.map(m => m.user))
  );
  // Exact split: what each person typed
  const [exact, setExact] = useState(() =>
    Object.fromEntries(members.map(m => {
      const share = shareFor(m.user);
      return [m.user, expense?.splitType === 'exact' && share ? centsToInput(share.amountCents) : ''];
    }))
  );
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const set = (field) => (e) => setFields(prev => ({ ...prev, [field]: e.target.value }));
  const toggle = (user) => setIncluded(prev => {
    const next = new Set(prev);
    if (next.has(user)) next.delete(user);
    else next.add(user);
    return next;
  });

  const amountCents = parseDollars(fields.amount);
  // Members in event order, so leftover cents land predictably
  const includedIds = members.map(m => m.user).filter(user => included.has(user));
  const exactCents = members.map(m => ({ user: m.user, amountCents: exact[m.user] === '' ? 0 : parseDollars(exact[m.user]) }));
  const exactTotal = exactCents.reduce((sum, s) => sum + (s.amountCents ?? 0), 0);

  // The shares to send, or an error message
  const buildShares = () => {
    if (fields.splitType === 'equal') {
      if (includedIds.length === 0) return { error: 'Choose at least one person to split with.' };
      return { shares: splitEqually(amountCents, includedIds) };
    }
    if (exactCents.some(s => s.amountCents === null)) return { error: 'Enter each amount like 12 or 12.50.' };
    if (exactTotal !== amountCents) return { error: 'The amounts must add up to the total.' };
    return { shares: exactCents.filter(s => s.amountCents > 0) };
  };

  const run = async (action) => {
    setError('');
    setIsSaving(true);
    try {
      await action();
      onSaved();
    } catch (err) {
      setError(err.message);
      setIsSaving(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const description = fields.description.trim();
    if (!description) return setError('Please describe the expense.');
    if (amountCents === null || amountCents <= 0) return setError('Enter an amount like 42 or 42.50.');
    if (!fields.date) return setError('Please choose a date.');

    const { shares, error: shareError } = buildShares();
    if (shareError) return setError(shareError);

    const body = { description, amountCents, date: fields.date, paidBy: fields.paidBy, splitType: fields.splitType, shares };
    run(() => (expense
      ? eventService.updateExpense(event._id, expense._id, body)
      : eventService.addExpense(event._id, body)));
  };

  const handleDelete = () => {
    if (!confirmingDelete) return setConfirmingDelete(true);
    run(() => eventService.deleteExpense(event._id, expense._id));
  };

  const inputClass = 'field';
  const eachCents = amountCents && includedIds.length ? Math.floor(amountCents / includedIds.length) : null;
  const remaining = amountCents !== null ? amountCents - exactTotal : null;

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black bg-opacity-40" role="dialog" aria-modal="true" aria-labelledby="expense-form-title">
      <form onSubmit={handleSubmit} className="bg-surface border-t border-line rounded-t-3xl p-4 max-h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 id="expense-form-title" className="text-lg font-semibold">{expense ? 'Edit expense' : 'Add expense'}</h2>
          <button type="button" onClick={onClose} className="text-faint" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-3 rounded mb-4">{error}</div>}

        <label htmlFor="expense-description" className="block text-sm font-medium text-fg/80 mb-1">What was it for</label>
        <input id="expense-description" className={`${inputClass} mb-3`} maxLength={80} placeholder="Airbnb" value={fields.description} onChange={set('description')} />

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label htmlFor="expense-amount" className="block text-sm font-medium text-fg/80 mb-1">Amount ($)</label>
            <input id="expense-amount" inputMode="decimal" className={inputClass} placeholder="0.00" value={fields.amount} onChange={set('amount')} />
          </div>
          <div>
            <label htmlFor="expense-date" className="block text-sm font-medium text-fg/80 mb-1">Date</label>
            <input id="expense-date" type="date" className={inputClass} value={fields.date} onChange={set('date')} />
          </div>
        </div>

        <label htmlFor="expense-paid-by" className="block text-sm font-medium text-fg/80 mb-1">Paid by</label>
        <select id="expense-paid-by" className={`${inputClass} mb-3`} value={fields.paidBy} onChange={set('paidBy')}>
          {members.map(m => (
            <option key={m.user} value={m.user}>{m.user === currentUser?._id ? `${m.name} (you)` : m.name}</option>
          ))}
        </select>

        <fieldset className="mb-3">
          <legend className="block text-sm font-medium text-fg/80 mb-1">Split</legend>
          <div className="grid grid-cols-2 gap-2 mb-2" role="radiogroup">
            {[['equal', 'Equally'], ['exact', 'Exact amounts']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={fields.splitType === value}
                onClick={() => setFields(prev => ({ ...prev, splitType: value }))}
                className={`border p-2 rounded-xl text-sm ${fields.splitType === value ? 'border-violet bg-violet/10 text-violet-soft' : 'border-line text-fg/80'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {fields.splitType === 'equal' ? (
            <div className="space-y-1">
              {members.map(m => (
                <label key={m.user} className="flex items-center text-sm py-1">
                  <input type="checkbox" className="mr-2 h-4 w-4 accent-purple-600" checked={included.has(m.user)} onChange={() => toggle(m.user)} />
                  {m.name}
                </label>
              ))}
              {eachCents !== null && (
                <p className="text-sm text-muted">
                  {formatCents(eachCents)}{amountCents % includedIds.length ? '+' : ''} each
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.user} className="flex items-center justify-between text-sm">
                  <label htmlFor={`exact-${m.user}`}>{m.name}</label>
                  <input
                    id={`exact-${m.user}`}
                    inputMode="decimal"
                    className="w-28 p-1.5 border border-line rounded-xl text-right"
                    placeholder="0.00"
                    value={exact[m.user]}
                    onChange={e => setExact(prev => ({ ...prev, [m.user]: e.target.value }))}
                  />
                </div>
              ))}
              {remaining !== null && (
                <p className={`text-sm ${remaining === 0 ? 'text-go' : 'text-orange-400'}`}>
                  {remaining === 0 ? 'Adds up to the total' : remaining > 0 ? `${formatCents(remaining)} left to assign` : `${formatCents(-remaining)} too much`}
                </p>
              )}
            </div>
          )}
        </fieldset>

        <Button type="submit" fullWidth size="lg" disabled={isSaving}>
          {isSaving ? 'Saving...' : expense ? 'Save changes' : 'Add expense'}
        </Button>

        {expense && (
          <button type="button" onClick={handleDelete} disabled={isSaving} className="w-full mt-2 py-3 text-red-400 font-medium disabled:opacity-50">
            {confirmingDelete ? 'Tap again to delete' : 'Delete expense'}
          </button>
        )}
      </form>
    </div>
  );
};

export default ExpenseForm;
