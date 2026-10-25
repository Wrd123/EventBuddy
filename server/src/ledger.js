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

module.exports = { netCents, settlesWithinBalances };
