// Demo accounts and events: a shared world for development (never seed it
// into a production database: the demo password is public), and private
// copies for each visitor to a hosted demo.
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Event = require('../models/Event');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const Message = require('../models/Message');
const ChatRead = require('../models/ChatRead');
const LocationShare = require('../models/LocationShare');
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

// An id that sorts by this time, like one MongoDB would have made then.
// (ObjectId.createFromTime zero-fills the rest, so two demo worlds made in
// the same second would collide.)
const objectIdAt = (date) =>
  new mongoose.Types.ObjectId(
    Math.floor(date.getTime() / 1000).toString(16).padStart(8, '0') + crypto.randomBytes(8).toString('hex')
  );

// Fixed ids so links to demo events (e.g. Groups -> event) stay stable
// across restarts and re-seeds. Users too: the development server restarts
// with a fresh in-memory database, and a saved login should still work.
const DEMO_USER_IDS = {
  me: new mongoose.Types.ObjectId('00000000000000000000a001'),
  Alex: new mongoose.Types.ObjectId('00000000000000000000a002'),
  Taylor: new mongoose.Types.ObjectId('00000000000000000000a003'),
  Jordan: new mongoose.Types.ObjectId('00000000000000000000a004'),
  Jamie: new mongoose.Types.ObjectId('00000000000000000000a005'),
  Casey: new mongoose.Types.ObjectId('00000000000000000000a006')
};

const DEMO_EVENT_IDS = {
  festival: new mongoose.Types.ObjectId('000000000000000000000001'),
  hiking: new mongoose.Types.ObjectId('000000000000000000000002'),
  beach: new mongoose.Types.ObjectId('000000000000000000000003'),
  picnic: new mongoose.Types.ObjectId('000000000000000000000004')
};

// users: { me, Alex, Taylor, ... } as created below; ids: the world's event
// ids. Map positions are filled in, so the demo map works without looking
// anything up.
const demoEvents = (users, ids) => {
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
      _id: ids.festival,
      name: 'Summer Music Festival',
      type: 'music-festival',
      coverIndex: 0,
      startDate: '2027-04-15',
      endDate: '2027-04-18',
      location: 'Indio, CA',
      geo: { for: 'Indio, CA', lat: 33.7206, lng: -116.2156 },
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
      _id: ids.hiking,
      name: 'Hiking Trip',
      type: 'outdoor',
      coverIndex: 0,
      startDate: '2026-11-13',
      endDate: '2026-11-15',
      location: 'Smoky Mountains',
      geo: { for: 'Smoky Mountains', lat: 35.6532, lng: -83.507 },
      description: 'Weekend hiking adventure in the mountains',
      members: ['me', 'Alex', 'Jordan', 'Casey'].map(member),
      schedule: [
        item('2026-11-14', '09:00', '12:00', 'Morning Hike', 'Trail Head', going('me', 'Alex', 'Jordan')),
        item('2026-11-14', '13:00', '15:00', 'Lunch Break', 'Summit', going('me', 'Alex', 'Jordan'))
      ],
      createdBy: me._id
    },
    {
      _id: ids.beach,
      name: 'Beach Day',
      type: 'outdoor',
      coverIndex: 1,
      startDate: '2026-08-08',
      endDate: '2026-08-08',
      location: 'Tybee Island, GA',
      geo: { for: 'Tybee Island, GA', lat: 32.0002, lng: -80.8454 },
      description: 'Day trip to the beach',
      members: ['me', 'Taylor', 'Jamie'].map(member),
      schedule: [
        item('2026-08-08', '10:00', '16:00', 'Beach', 'North Beach', going('Taylor', 'Jamie'))
      ],
      createdBy: me._id
    }
  ];
};

// The festival chat: yesterday's planning and two new messages this morning,
// which John hasn't read yet. Chats are ordered by id, so ids are made from
// the send times.
const demoChat = (users, ids) => {
  const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000);
  const message = (minutes, name, text) => {
    const createdAt = minutesAgo(minutes);
    return {
      _id: objectIdAt(createdAt),
      event: ids.festival,
      sender: { user: users[name]._id, name: users[name].name },
      text,
      createdAt
    };
  };

  const messages = [
    message(26 * 60, 'Alex', 'Has anyone looked at the schedule? I added Arctic Monkeys on the first day.'),
    message(26 * 60 - 3, 'Taylor', "Yes! I'm going to Tame Impala right after too."),
    message(26 * 60 - 5, 'me', "Let's meet at the main stage around 1:30 so we get a good spot."),
    message(25 * 60, 'Jordan', 'I put the Airbnb in expenses. Check what you owe when you get a sec.'),
    message(90, 'Alex', "Who's bringing a portable charger?"),
    message(85, 'Jamie', "I've got two, I'll bring both 🔋")
  ];
  const read = { event: ids.festival, user: users.me._id, lastRead: messages[3]._id };
  return { messages, read };
};

// A picnic happening today, so live locations can be tried right away:
// three friends are already sharing where they are in the park and Taylor
// has set a meetup point.
const PARK = { lat: 33.7851, lng: -84.3738 };

// "Today" is the calendar day in Atlanta, where the picnic is. A hosted
// server's clock is usually UTC, which by a US evening is already tomorrow.
const PARK_TIME_ZONE = 'America/New_York';

// 'YYYY-MM-DD' for the given moment in a time zone (en-CA formats dates
// that way)
const dayIn = (timeZone, now = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

// today: the visitor's own date when known, else Atlanta's
const demoPicnic = (users, ids, today) => {
  const now = Date.now();
  const minutesAgo = (minutes) => new Date(now - minutes * 60 * 1000);
  const todayISO = today || dayIn(PARK_TIME_ZONE, now);
  const color = (name) => DEMO_FRIENDS.find((f) => f.name === name)?.color || ORGANIZER_COLOR;
  const member = (name) => ({ user: users[name]._id, name: users[name].name, color: color(name) });
  const until = new Date(now + 6 * 60 * 60 * 1000);
  const share = (name, lat, lng, minutes) =>
    ({ event: ids.picnic, user: users[name]._id, until, lat, lng, accuracy: 12, positionAt: minutesAgo(minutes) });

  const event = {
    _id: ids.picnic,
    name: 'Picnic in the Park',
    type: 'outdoor',
    // The picnic photo, rather than Taylor's turn (the hiking one)
    coverIndex: 9,
    startDate: todayISO,
    endDate: todayISO,
    location: 'Piedmont Park, Atlanta, GA',
    geo: { for: 'Piedmont Park, Atlanta, GA', ...PARK },
    description: 'Blankets, snacks and frisbee by the lake',
    members: ['Taylor', 'me', 'Alex', 'Jordan'].map(member),
    schedule: [],
    meetup: {
      lat: 33.7857,
      lng: -84.3741,
      note: 'By the lake, near the dock',
      time: '',
      setBy: { user: users.Taylor._id, name: users.Taylor.name },
      setAt: minutesAgo(20),
      expiresAt: new Date(now + 12 * 60 * 60 * 1000)
    },
    createdBy: users.Taylor._id
  };
  const shares = [
    share('Alex', 33.7866, -84.3727, 2),
    share('Taylor', 33.7856, -84.3745, 6),
    // Hasn't moved or opened the app in a while: shown as last seen
    share('Jordan', 33.7832, -84.3768, 25)
  ];
  return { event, shares };
};

// Festival money: who paid for what, and one payment already settled
const demoLedger = (users, ids) => {
  const event = ids.festival;
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

// Saves a whole demo world: accounts, events, money, chat and the picnic's
// live locations. users: [{ key, _id, name, username, email }] with key 'me'
// first, then the friends' names.
const insertDemoWorld = async ({ users: accounts, eventIds, passwordHash, demoWorld, today }) => {
  const created = await User.create(accounts.map(({ key, ...account }) => ({
    ...account,
    passwordHash,
    demoWorld,
    // Friends' only payment handle is Zelle at their example.com address:
    // example.com is reserved, so no one can pay a real stranger by
    // accident. Made-up Venmo/Cash App/PayPal names could be real people.
    paymentHandles: key === 'me' ? undefined : { zelle: account.email }
  })));
  const users = Object.fromEntries(accounts.map(({ key }, i) => [key, created[i]]));

  // Validation is skipped on purpose: some demo events are in the past
  await Event.insertMany(demoEvents(users, eventIds));
  const ledger = demoLedger(users, eventIds);
  await Expense.insertMany(ledger.expenses);
  await Payment.insertMany(ledger.payments);
  const chat = demoChat(users, eventIds);
  await Message.insertMany(chat.messages);
  await ChatRead.create(chat.read);
  const picnic = demoPicnic(users, eventIds, today);
  await Event.insertMany([picnic.event]);
  await LocationShare.insertMany(picnic.shares);
  return users.me;
};

// The shared demo world for local development: log in as user@example.com
// (or a friend) with the password "password". Created if missing; safe to
// run repeatedly. Returns the demo user.
const seedDemoData = async () => {
  const existing = await User.findOne({ email: DEMO_LOGIN.email });
  if (existing) return existing;

  return insertDemoWorld({
    users: [
      { key: 'me', _id: DEMO_USER_IDS.me, email: DEMO_LOGIN.email, username: 'johndoe', name: 'John Doe' },
      ...DEMO_FRIENDS.map(({ name, username, email }) => ({ key: name, _id: DEMO_USER_IDS[name], name, username, email }))
    ],
    eventIds: DEMO_EVENT_IDS,
    // One hash for everyone: same password, and hashing is deliberately slow
    passwordHash: await User.hashPassword(DEMO_PASSWORD)
  });
};

// Private demo worlds: every "Try the demo" gets its own copy, so what one
// visitor adds or changes never shows up for the next. A world is named by a
// random tag, and every id in it is derived from that tag, so a saved login
// can rebuild the same world after a hosted demo restarts with an empty
// database.
const newDemoWorldTag = () => crypto.randomBytes(6).toString('hex');

const idInWorld = (tag, key) =>
  new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`${tag}:${key}`).digest('hex').slice(0, 24));

const demoWorldUserId = (tag) => idInWorld(tag, 'user:me');

// Nobody signs in to a world's accounts with a password (only with the
// demo's token), so they share one unguessable one, hashed once
let worldPasswordHash = null;
const worldPassword = () => {
  worldPasswordHash = worldPasswordHash || User.hashPassword(crypto.randomBytes(32).toString('hex'));
  return worldPasswordHash;
};

// Creates the world named tag (or rebuilds it after a restart) and returns
// its John.
// today: the visitor's 'YYYY-MM-DD', so the picnic is on their today.
const createDemoWorld = async ({ tag = newDemoWorldTag(), today } = {}) => {
  const account = (key, name, username) => ({
    key,
    _id: idInWorld(tag, `user:${key}`),
    name,
    username: `${username}-${tag}`,
    email: `${username}.${tag}@example.com`
  });

  return insertDemoWorld({
    users: [account('me', 'John Doe', 'john'), ...DEMO_FRIENDS.map(({ name, username }) => account(name, name, username))],
    eventIds: Object.fromEntries(Object.keys(DEMO_EVENT_IDS).map((key) => [key, idInWorld(tag, `event:${key}`)])),
    passwordHash: await worldPassword(),
    demoWorld: tag,
    today
  });
};

// Deletes demo worlds older than maxAgeMs, and the oldest beyond
// maxWorlds - 1 (leaving room for one more), with everything in them. A
// sleeping host starts empty anyway; this bounds a busy one's memory, even
// if someone signs in to the demo over and over. Returns how many went.
const pruneDemoWorlds = async ({ maxAgeMs, maxWorlds }) => {
  const owners = await User.find({ demoWorld: { $exists: true }, username: /^john-/ }, 'demoWorld createdAt')
    .sort({ createdAt: -1 });
  const cutoff = Date.now() - maxAgeMs;
  const tags = owners
    .filter((owner, newest) => newest >= maxWorlds - 1 || owner.createdAt.getTime() < cutoff)
    .map((owner) => owner.demoWorld);
  if (tags.length === 0) return 0;

  const userIds = (await User.find({ demoWorld: { $in: tags } }, '_id')).map((u) => u._id);
  const eventIds = (await Event.find({ createdBy: { $in: userIds } }, '_id')).map((e) => e._id);
  await Promise.all([
    Event.deleteMany({ _id: { $in: eventIds } }),
    Expense.deleteMany({ event: { $in: eventIds } }),
    Payment.deleteMany({ event: { $in: eventIds } }),
    Message.deleteMany({ event: { $in: eventIds } }),
    ChatRead.deleteMany({ $or: [{ event: { $in: eventIds } }, { user: { $in: userIds } }] }),
    LocationShare.deleteMany({ $or: [{ event: { $in: eventIds } }, { user: { $in: userIds } }] }),
    User.deleteMany({ _id: { $in: userIds } })
  ]);
  return tags.length;
};

module.exports = {
  seedDemoData,
  createDemoWorld,
  demoWorldUserId,
  pruneDemoWorlds,
  dayIn,
  DEMO_LOGIN,
  DEMO_FRIENDS,
  DEMO_EVENT_IDS
};
