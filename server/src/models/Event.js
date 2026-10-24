const crypto = require('crypto');
const mongoose = require('mongoose');

// Event dates are calendar days stored as "YYYY-MM-DD" strings, matching the
// client. A Date would be a moment in UTC and shift a day for US users, and
// ISO date strings still sort and range-query correctly in MongoDB.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A member is a registered user. The name is copied in so events render
// without looking up every user.
const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '#7c3aed' }
});

// Times are "HH:MM" (24-hour) strings: like ISO dates they sort and compare
// correctly as text, and they mean wall-clock time at the event
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Who's going to a schedule item (a member, with their name copied in)
const attendeeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const scheduleItemSchema = new mongoose.Schema({
  date: { type: String, required: true, match: ISO_DATE },
  startTime: { type: String, required: true, match: TIME },
  endTime: { type: String, default: '', match: [/^$|^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid end time'] },
  activity: { type: String, required: true, trim: true, maxlength: 80 },
  location: { type: String, default: '', trim: true, maxlength: 80 },
  attendees: [attendeeSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

// The secret in an event's invite link. 9 random bytes = 72 bits, written
// as 12 URL-safe characters: far too many to guess or enumerate.
const newInviteCode = () => crypto.randomBytes(9).toString('base64url');

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    type: {
      type: String,
      enum: ['music-festival', 'concert', 'outdoor', 'group-travel', 'sports', 'arts'],
      default: 'music-festival'
    },
    startDate: { type: String, required: true, match: ISO_DATE },
    endDate: { type: String, required: true, match: ISO_DATE },
    location: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    // Where to buy tickets, for events planned from Discover
    ticketUrl: { type: String, default: '', trim: true, maxlength: 500 },
    members: [memberSchema],
    schedule: [scheduleItemSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Anyone with the link can join, so only members ever see it (events are
    // only sent to members) and the organizer can replace it
    inviteCode: { type: String, default: newInviteCode, unique: true },
    // Where the location is on a map, looked up the first time the map needs
    // it. `for` is the text that was looked up, so editing the location
    // makes it stale. lat/lng are null when nothing matched.
    geo: {
      type: new mongoose.Schema({ for: String, lat: Number, lng: Number }, { _id: false }),
      default: null
    },
    // Optional trip budget in whole cents, set by the organizer
    budgetCents: {
      type: Number,
      default: null,
      min: 0,
      validate: { validator: (v) => v === null || Number.isInteger(v), message: 'Budget must be whole cents' }
    }
  },
  { timestamps: true }
);

// "Events I can see" queries look up by member and by creator
eventSchema.index({ 'members.user': 1 });
eventSchema.index({ createdBy: 1 });

eventSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    // Only the map uses it, through /api/map
    delete ret.geo;
    return ret;
  }
});

module.exports = mongoose.model('Event', eventSchema);
module.exports.ISO_DATE = ISO_DATE;
module.exports.TIME = TIME;
module.exports.newInviteCode = newInviteCode;
