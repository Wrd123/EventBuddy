// Demo accounts and events for development. Never seed this into a
// production database: the demo password is public.
const mongoose = require('mongoose');
const User = require('../models/User');
const Event = require('../models/Event');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const { ORGANIZER_COLOR } = require('../colors');

const DEMO_PASSWORD = 'password';
const DEMO_LOGIN = { email: 'user@example.com', password: DEMO_PASSWORD };

// Friends are real accounts too, so you can log in as one of them (same
// password) to try invites from the other side
const DEMO_FRIENDS = [
  { name: 'Alex', username: 'alex', email: 'alex@example.com', color: '#3b82f6' },
  { name: 'Taylor', username: 'taylor', email: 'taylor@example.com', color: '#10b981' },
  { name: 'Jordan', username: 'jordan', email: 'jordan@example.com', color: '#8b5cf6' },
  { name: 'Jamie', username: 'jamie', email: 'jamie@example.com', color: '#f59e0b' },
  { name: 'Casey', username: 'casey', email: 'casey@example.com', color: '#ec4899' }
];

// Fixed ids so links to demo events (e.g. Groups -> event) stay stable
// across restarts and re-seeds
const DEMO_EVENT_IDS = {
  festival: new mongoose.Types.ObjectId('000000000000000000000001'),
  hiking: new mongoose.Types.ObjectId('000000000000000000000002'),
  beach: new mongoose.Types.ObjectId('000000000000000000000003')
};

// users: { me, Alex, Taylor, ... } as created below
const demoEvents = (users) => {
  const { me } = users;
  const member = (name) => {
    const user = users[name];
    const color = name === 'me' ? ORGANIZER_COLOR : DEMO_FRIENDS.find((f) => f.name === name).color;
    return { user: user._id, name: user.name, color };
  };
  const going = (...names) => names.map((name) => ({ user: users[name]._id, name: users[name].name }));
  const item = (date, startTime, endTime, activity, location, attendees) =>
    ({ date, startTime, endTime, activity, location, attendees, createdBy: me._id });

  return [
    {
      _id: DEMO_EVENT_IDS.festival,
      name: 'Summer Music Festival',
      type: 'music-festival',
      startDate: '2027-04-15',
      endDate: '2027-04-18',
      location: 'Indio, CA',
      description: 'Annual summer music festival with top artists',
      budgetCents: 85000,
      members: ['me', 'Alex', 'Taylor', 'Jordan', 'Jamie'].map(member),
      schedule: [
        item('2027-04-15', '14:00', '15:30', 'Arctic Monkeys', 'Main Stage', going('me', 'Alex', 'Taylor', 'Jordan')),
        item('2027-04-15', '16:00', '17:00', 'Tame Impala', 'Sunset Stage', going('me', 'Taylor')),
        item('2027-04-16', '17:30', '18:30', 'Billie Eilish', 'Main Stage', going('Jamie')),
        item('2027-04-17', '19:00', '20:30', 'The Strokes', 'Desert Stage', going())
      ],
      createdBy: me._id
    },
    {
      _id: DEMO_EVENT_IDS.hiking,
      name: 'Hiking Trip',
      type: 'outdoor',
      startDate: '2026-11-13',
      endDate: '2026-11-15',
      location: 'Smoky Mountains',
      description: 'Weekend hiking adventure in the mountains',
      members: ['me', 'Alex', 'Jordan', 'Casey'].map(member),
      schedule: [
        item('2026-11-14', '09:00', '12:00', 'Morning Hike', 'Trail Head', going('me', 'Alex', 'Jordan')),
        item('2026-11-14', '13:00', '15:00', 'Lunch Break', 'Summit', going('me', 'Alex', 'Jordan'))
      ],
      createdBy: me._id
    },
    {
      _id: DEMO_EVENT_IDS.beach,
      name: 'Beach Day',
      type: 'outdoor',
      startDate: '2026-08-08',
      endDate: '2026-08-08',
      location: 'Tybee Island, GA',
      description: 'Day trip to the beach',
      members: ['me', 'Taylor', 'Jamie'].map(member),
      schedule: [
        item('2026-08-08', '10:00', '16:00', 'Beach', 'North Beach', going('Taylor', 'Jamie'))
      ],
      createdBy: me._id
    }
  ];
};

// Festival money: who paid for what, and one payment already settled
const demoLedger = (users) => {
  const event = DEMO_EVENT_IDS.festival;
  const who = (name) => ({ user: users[name]._id, name: users[name].name });
  const equally = (amountCents, ...names) => {
    // Same rule as the app: leftover cents go to the first people listed
    const base = Math.floor(amountCents / names.length);
    const extra = amountCents % names.length;
    return names.map((name, i) => ({ ...who(name), amountCents: base + (i < extra ? 1 : 0) }));
  };
  const expense = (description, amountCents, date, payer, shares) => ({
    event, description, amountCents, date, paidBy: who(payer), splitType: 'equal', shares, createdBy: users[payer]._id
  });

  return {
    expenses: [
      expense('Airbnb', 32000, '2027-03-01', 'Alex', equally(32000, 'me', 'Alex', 'Taylor', 'Jordan')),
      expense('Rental car', 12000, '2027-04-14', 'Taylor', equally(12000, 'me', 'Alex', 'Taylor', 'Jordan')),
      expense('Groceries & drinks', 12050, '2027-04-15', 'me', equally(12050, 'me', 'Alex', 'Taylor', 'Jordan', 'Jamie'))
    ],
    payments: [
      { event, from: who('Jordan'), to: who('Alex'), amountCents: 8000, date: '2027-03-02', createdBy: users.Jordan._id }
    ]
  };
};

// Creates the demo accounts and events if the demo user doesn't exist yet.
// Safe to run repeatedly. Returns the demo user.
const seedDemoData = async () => {
  const existing = await User.findOne({ email: DEMO_LOGIN.email });
  if (existing) return existing;

  // One hash for everyone: same password, and hashing is deliberately slow
  const passwordHash = await User.hashPassword(DEMO_PASSWORD);
  const [me, ...friends] = await User.create([
    { email: DEMO_LOGIN.email, username: 'johndoe', name: 'John Doe', passwordHash },
    // Friends' only payment handle is Zelle at their example.com address:
    // example.com is reserved, so no one can pay a real stranger by
    // accident. Made-up Venmo/Cash App/PayPal names could be real people.
    ...DEMO_FRIENDS.map(({ name, username, email }) => ({
      name, username, email, passwordHash, paymentHandles: { zelle: email }
    }))
  ]);

  const users = { me };
  friends.forEach((friend) => { users[friend.name] = friend; });

  // Validation is skipped on purpose: some demo events are in the past
  await Event.insertMany(demoEvents(users));
  const ledger = demoLedger(users);
  await Expense.insertMany(ledger.expenses);
  await Payment.insertMany(ledger.payments);
  return me;
};

module.exports = { seedDemoData, DEMO_LOGIN, DEMO_FRIENDS, DEMO_EVENT_IDS };
