// Group balances from an event's expenses and payments, all in cents.
//
// net > 0: the group owes this person. net < 0: they owe the group.
// Nets always sum to zero, because every expense's shares add up to what
// its payer paid.

// [{ user, name, color, paidCents, shareCents, netCents }], one per member
// (plus anyone on an old record who isn't a member anymore)
export const computeBalances = (members, expenses, payments) => {
  const people = new Map();
  const personFor = ({ user, name, color }) => {
    if (!people.has(user)) {
      people.set(user, { user, name, color: color || '#9ca3af', paidCents: 0, shareCents: 0, netCents: 0 });
    }
    return people.get(user);
  };
  members.forEach(personFor);

  for (const expense of expenses) {
    const payer = personFor(expense.paidBy);
    payer.paidCents += expense.amountCents;
    payer.netCents += expense.amountCents;
    for (const share of expense.shares) {
      const person = personFor(share);
      person.shareCents += share.amountCents;
      person.netCents -= share.amountCents;
    }
  }

  // Paying someone back moves you toward even, and them too
  for (const payment of payments) {
    personFor(payment.from).netCents += payment.amountCents;
    personFor(payment.to).netCents -= payment.amountCents;
  }

  return [...people.values()];
};

// A short list of payments that brings everyone to zero: repeatedly match
// whoever owes the most with whoever is owed the most. n people never need
// more than n - 1 payments. It isn't always the fewest possible (owed $6
// and $4, owing $4, $3 and $3 gives four where three would do); finding the
// true minimum is a much harder search, and a list this short is plenty.
// Ties break by name so the list doesn't reshuffle.
// -> [{ from: { user, name }, to: { user, name }, amountCents }]
export const settleUp = (balances) => {
  const byAmount = (a, b) => b.amount - a.amount || a.name.localeCompare(b.name);
  const owed = balances.filter(b => b.netCents > 0).map(b => ({ ...b, amount: b.netCents })).sort(byAmount);
  const owing = balances.filter(b => b.netCents < 0).map(b => ({ ...b, amount: -b.netCents })).sort(byAmount);

  const payments = [];
  let i = 0;
  let j = 0;
  while (i < owing.length && j < owed.length) {
    const amountCents = Math.min(owing[i].amount, owed[j].amount);
    payments.push({
      from: { user: owing[i].user, name: owing[i].name },
      to: { user: owed[j].user, name: owed[j].name },
      amountCents
    });
    owing[i].amount -= amountCents;
    owed[j].amount -= amountCents;
    if (owing[i].amount === 0) i += 1;
    if (owed[j].amount === 0) j += 1;
  }
  return payments;
};
