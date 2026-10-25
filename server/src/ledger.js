// Each person's net balance in an event, in cents: the same math as
// computeBalances in the app's src/utils/ledger.js. net > 0: the group owes
// them. net < 0: they owe the group. The server only needs this to check a
// payment before saving it.
const netCents = (expenses, payments) => {
  const nets = new Map();
  const add = (userId, cents) => {
    const key = userId.toString();
    nets.set(key, (nets.get(key) || 0) + cents);
  };

  for (const expense of expenses) {
    add(expense.paidBy.user, expense.amountCents);
    for (const share of expense.shares) add(share.user, -share.amountCents);
  }
  for (const payment of payments) {
    add(payment.from.user, payment.amountCents);
    add(payment.to.user, -payment.amountCents);
  }
  return nets;
};

// Paying someone back can only bring both people toward even, never past
// it. "Mark paid" only ever offers amounts like that, so a payment that
// breaks the rule was already recorded, by the other person or from a
// screen that hadn't caught up yet.
const settlesWithinBalances = (nets, { from, to, amountCents }) => {
  const owes = -(nets.get(from.toString()) || 0);
  const owed = nets.get(to.toString()) || 0;
  return amountCents <= owes && amountCents <= owed;
};

// People no longer in the event whose balance a change would move off even.
// They can't record payments any more, so nobody could settle it.
// -> their names, from the money records
const formerMembersLeftUneven = (event, before, after) => {
  const isMember = (userId) => event.members.some((m) => m.user.equals(userId));
  const names = new Map();
  for (const record of [...before.expenses, ...before.payments, ...after.expenses, ...after.payments]) {
    const people = record.paidBy ? [record.paidBy, ...record.shares] : [record.from, record.to];
    for (const p of people) if (!isMember(p.user)) names.set(p.user.toString(), p.name);
  }
  const was = netCents(before.expenses, before.payments);
  const will = netCents(after.expenses, after.payments);
  return [...names].filter(([id]) => (will.get(id) || 0) !== 0 && (will.get(id) || 0) !== (was.get(id) || 0))
    .map(([, name]) => name);
};

// For messages only ("$20.00"); amounts stay whole cents everywhere else
const formatCents = (cents) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

module.exports = { netCents, settlesWithinBalances, formerMembersLeftUneven, formatCents };
