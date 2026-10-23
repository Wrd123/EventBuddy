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

const scheduleItemSchema = new mongoose.Schema({
  date: { type: String, required: true, match: ISO_DATE },
  time: { type: String, default: '' },
  activity: { type: String, required: true, trim: true },
  location: { type: String, default: '', trim: true },
  attending: { type: Number, default: 0, min: 0 }
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
