import { computeBalances, settleUp } from './ledger';

const person = (user, name) => ({ user, name });
const members = [person('me', 'John'), person('alex', 'Alex'), person('taylor', 'Taylor'), person('jordan', 'Jordan')];

const expense = (amountCents, payer, shares) => ({
  amountCents,
  paidBy: payer,
  shares: shares.map(([who, amount]) => ({ ...who, amountCents: amount }))
});

const nets = (balances) => Object.fromEntries(balances.map(b => [b.name, b.netCents]));

describe('computeBalances', () => {
  it('credits the payer and debits everyone in the split', () => {
    const balances = computeBalances(members, [
      expense(30000, members[1], [[members[0], 10000], [members[1], 10000], [members[2], 10000]])
    ], []);

    expect(nets(balances)).toEqual({ John: -10000, Alex: 20000, Taylor: -10000, Jordan: 0 });
    expect(balances.find(b => b.name === 'Alex')).toMatchObject({ paidCents: 30000, shareCents: 10000 });
  });

  it('counts payments toward evening out', () => {
    const balances = computeBalances(
      members,
      [expense(30000, members[1], [[members[0], 10000], [members[1], 10000], [members[2], 10000]])],
      [{ from: members[0], to: members[1], amountCents: 10000 }]
    );

    expect(nets(balances)).toEqual({ John: 0, Alex: 10000, Taylor: -10000, Jordan: 0 });
  });

  it('includes people on old records who are no longer members', () => {
    const gone = person('gone', 'Casey');
    const balances = computeBalances(members, [expense(1000, gone, [[members[0], 1000]])], []);

    expect(nets(balances).Casey).toBe(1000);
  });

  it('always nets to zero across the group', () => {
    const balances = computeBalances(members, [
      expense(32000, members[1], [[members[0], 8000], [members[1], 8000], [members[2], 8000], [members[3], 8000]]),
      expense(12050, members[0], [[members[0], 4017], [members[2], 4017], [members[3], 4016]])
    ], [{ from: members[3], to: members[1], amountCents: 8000 }]);

    expect(balances.reduce((sum, b) => sum + b.netCents, 0)).toBe(0);
  });
});

describe('settleUp', () => {
  const balance = (name, netCents) => ({ user: name.toLowerCase(), name, netCents });

  it('returns nothing when everyone is even', () => {
    expect(settleUp([balance('A', 0), balance('B', 0)])).toEqual([]);
  });

  it('pairs a single debt directly', () => {
    expect(settleUp([balance('A', -500), balance('B', 500)])).toEqual([
      { from: { user: 'a', name: 'A' }, to: { user: 'b', name: 'B' }, amountCents: 500 }
    ]);
  });

  it('needs at most n - 1 payments and settles everyone exactly', () => {
    const balances = [balance('A', 7000), balance('B', -2500), balance('C', -3000), balance('D', -1500), balance('E', 0)];
    const payments = settleUp(balances);

    expect(payments.length).toBeLessThanOrEqual(balances.length - 1);
    const after = Object.fromEntries(balances.map(b => [b.user, b.netCents]));
    for (const p of payments) {
      after[p.from.user] += p.amountCents;
      after[p.to.user] -= p.amountCents;
    }
    expect(Object.values(after).every(v => v === 0)).toBe(true);
  });

  it('settles the largest debt with the largest credit first', () => {
    const payments = settleUp([balance('A', 3000), balance('B', 1000), balance('C', -3000), balance('D', -1000)]);

    expect(payments.map(p => `${p.from.name}->${p.to.name} ${p.amountCents}`)).toEqual(['C->A 3000', 'D->B 1000']);
  });

  it("doesn't change the balances it was given", () => {
    const balances = [balance('A', -500), balance('B', 500)];
    settleUp(balances);
    expect(balances[0].netCents).toBe(-500);
  });
});
