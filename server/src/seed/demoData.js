// Demo account and events for development. Never seed this into a
// production database: the demo password is public.
const mongoose = require('mongoose');
const User = require('../models/User');
const Event = require('../models/Event');

const DEMO_LOGIN = { email: 'user@example.com', password: 'password' };

// Fixed ids so links to demo events (e.g. Groups -> event) stay stable
// across restarts and re-seeds
const DEMO_EVENT_IDS = {
  festival: new mongoose.Types.ObjectId('000000000000000000000001'),
  hiking: new mongoose.Types.ObjectId('000000000000000000000002'),
  beach: new mongoose.Types.ObjectId('000000000000000000000003')
};

const friend = (name, color) => ({ name, color });

const demoEvents = (creator) => {
  const me = { user: creator._id, name: creator.name, color: '#7c3aed' };
  return [
    {
      _id: DEMO_EVENT_IDS.festival,
      name: 'Summer Music Festival',
      type: 'music-festival',
      startDate: '2027-04-15',
      endDate: '2027-04-18',
      location: 'Indio, CA',
      description: 'Annual summer music festival with top artists',
      members: [me, friend('Alex', '#3b82f6'), friend('Taylor', '#10b981'), friend('Jordan', '#8b5cf6'), friend('Jamie', '#f59e0b')],
      schedule: [
        { date: '2027-04-15', time: '2:00 PM - 3:30 PM', activity: 'Arctic Monkeys', location: 'Main Stage', attending: 4 },
        { date: '2027-04-15', time: '4:00 PM - 5:00 PM', activity: 'Tame Impala', location: 'Sunset Stage', attending: 2 },
        { date: '2027-04-16', time: '5:30 PM - 6:30 PM', activity: 'Billie Eilish', location: 'Main Stage', attending: 1 },
        { date: '2027-04-17', time: '7:00 PM - 8:30 PM', activity: 'The Strokes', location: 'Desert Stage', attending: 0 }
      ],
      createdBy: creator._id
    },
    {
      _id: DEMO_EVENT_IDS.hiking,
      name: 'Hiking Trip',
      type: 'outdoor',
      startDate: '2026-11-13',
      endDate: '2026-11-15',
      location: 'Smoky Mountains',
      description: 'Weekend hiking adventure in the mountains',
      members: [me, friend('Alex', '#3b82f6'), friend('Jordan', '#8b5cf6'), friend('Casey', '#ec4899')],
      schedule: [
        { date: '2026-11-14', time: '9:00 AM - 12:00 PM', activity: 'Morning Hike', location: 'Trail Head', attending: 3 },
        { date: '2026-11-14', time: '1:00 PM - 3:00 PM', activity: 'Lunch Break', location: 'Summit', attending: 3 }
      ],
      createdBy: creator._id
    },
    {
      _id: DEMO_EVENT_IDS.beach,
      name: 'Beach Day',
      type: 'outdoor',
      startDate: '2026-08-08',
      endDate: '2026-08-08',
      location: 'Tybee Island, GA',
      description: 'Day trip to the beach',
      members: [me, friend('Taylor', '#10b981'), friend('Jamie', '#f59e0b')],
      schedule: [
        { date: '2026-08-08', time: '10:00 AM - 4:00 PM', activity: 'Beach', location: 'North Beach', attending: 2 }
      ],
      createdBy: creator._id
    }
  ];
};

// Creates the demo user and events if the demo user doesn't exist yet.
// Safe to run repeatedly. Returns the demo user.
const seedDemoData = async () => {
  const existing = await User.findOne({ email: DEMO_LOGIN.email });
  if (existing) return existing;

  const user = await User.create({
    email: DEMO_LOGIN.email,
    username: 'johndoe',
    name: 'John Doe',
    passwordHash: await User.hashPassword(DEMO_LOGIN.password)
  });
  // Validation is skipped on purpose: some demo events are in the past
  await Event.insertMany(demoEvents(user));
  return user;
};

module.exports = { seedDemoData, DEMO_LOGIN, DEMO_EVENT_IDS };
