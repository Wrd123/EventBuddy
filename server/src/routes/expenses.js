// /api/events/:id/expenses and /api/events/:id/payments.
//
// Any member can see the ledger, add expenses and record payments they're
// part of. Changing or deleting an expense or payment is for whoever added
// it, or the organizer. Balances and "who pays whom" are worked out by the
// client from these records.
const express = require('express');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const { HttpError } = require('../errors');
const { validateExpense, validatePayment, text } = require('../validation');
const { findVisibleEvent } = require('../eventAccess');

// A member as stored on money records: { user, name }
const person = (event, userId) => {
  const member = event.members.find((m) => m.user.equals(userId));
  return { user: member.user, name: member.name };
};

const canChange = (record, event, user) =>
  record.createdBy.equals(user._id) || event.createdBy.equals(user._id);

const CHANGE_FORBIDDEN = 'Only the person who added this, or the organizer, can change it.';

const expenseFields = (body) => ({
  description: text(body.description),
  amountCents: body.amountCents,
  date: text(body.date),
  paidBy: body.paidBy,
  splitType: body.splitType,
  shares: Array.isArray(body.shares)
    ? body.shares.map((s) => ({ user: s?.user, amountCents: s?.amountCents }))
    : body.shares
});

// Validated fields -> what's stored (names filled in from the members)
const toStored = (fields, event) => ({
  description: fields.description,
  amountCents: fields.amountCents,
  date: fields.date,
  splitType: fields.splitType,
  paidBy: person(event, fields.paidBy),
  shares: fields.shares.map((s) => ({ ...person(event, s.user), amountCents: s.amountCents }))
});

const findExpense = async (event, expenseId) => {
  const expense = await Expense.findOne({ _id: expenseId, event: event._id });
  if (!expense) throw new HttpError(404, 'Expense not found.');
  return expense;
};

const expenses = express.Router({ mergeParams: true });

// The whole ledger in one request: expenses and payments, newest first
expenses.get('/', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const [expenseList, paymentList] = await Promise.all([
    Expense.find({ event: event._id }).sort({ date: -1, createdAt: -1 }),
    Payment.find({ event: event._id }).sort({ date: -1, createdAt: -1 })
  ]);
  res.json({ expenses: expenseList, payments: paymentList });
});

expenses.post('/', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const fields = expenseFields(req.body);

  const error = validateExpense(fields, event);
  if (error) throw new HttpError(400, error);

  const expense = await Expense.create({ ...toStored(fields, event), event: event._id, createdBy: req.user._id });
  res.status(201).json({ expense });
});

expenses.patch('/:expenseId', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const expense = await findExpense(event, req.params.expenseId);
  if (!canChange(expense, event, req.user)) throw new HttpError(403, CHANGE_FORBIDDEN);

  // Edits send the whole expense, so it's validated like a new one
  const fields = expenseFields(req.body);
  const error = validateExpense(fields, event);
  if (error) throw new HttpError(400, error);

  expense.set(toStored(fields, event));
  await expense.save();
  res.json({ expense });
});

expenses.delete('/:expenseId', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const expense = await findExpense(event, req.params.expenseId);
  if (!canChange(expense, event, req.user)) throw new HttpError(403, CHANGE_FORBIDDEN);

  await expense.deleteOne();
  res.status(204).end();
});

const payments = express.Router({ mergeParams: true });

payments.post('/', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const fields = {
    from: req.body.from,
    to: req.body.to,
    amountCents: req.body.amountCents,
    date: text(req.body.date)
  };

  const error = validatePayment(fields, event, req.user);
  if (error) throw new HttpError(400, error);

  const payment = await Payment.create({
    event: event._id,
    from: person(event, fields.from),
    to: person(event, fields.to),
    amountCents: fields.amountCents,
    date: fields.date,
    createdBy: req.user._id
  });
  res.status(201).json({ payment });
});

payments.delete('/:paymentId', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const payment = await Payment.findOne({ _id: req.params.paymentId, event: event._id });
  if (!payment) throw new HttpError(404, 'Payment not found.');
  if (!canChange(payment, event, req.user)) throw new HttpError(403, CHANGE_FORBIDDEN);

  await payment.deleteOne();
  res.status(204).end();
});

module.exports = { expenses, payments };
