const mongoose = require('mongoose');

// Event dates are calendar days stored as "YYYY-MM-DD" strings, matching the
// client. A Date would be a moment in UTC and shift a day for US users, and
// ISO date strings still sort and range-query correctly in MongoDB.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A member is either a registered user (user is set) or, until friends are
// real accounts, just a name someone was invited by
const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '#7c3aed' }
});

// Times are "HH:MM" (24-hour) strings: like ISO dates they sort and compare
// correctly as text, and they mean wall-clock time at the event
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Who's going to a schedule item. Like members, an attendee is a registered
// user or (for demo data, until friends are accounts) just a name.
const attendeeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    type: {
      type: String,
      enum: ['music-festival', 'concert', 'outdoor', 'group-travel'],
      default: 'music-festival'
    },
    startDate: { type: String, required: true, match: ISO_DATE },
    endDate: { type: String, required: true, match: ISO_DATE },
    location: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    members: [memberSchema],
    schedule: [scheduleItemSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

// "Events I can see" queries look up by member and by creator
eventSchema.index({ 'members.user': 1 });
eventSchema.index({ createdBy: 1 });

eventSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Event', eventSchema);
module.exports.ISO_DATE = ISO_DATE;
module.exports.TIME = TIME;
