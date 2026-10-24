const mongoose = require('mongoose');

// How far a user has read in an event's chat: the newest message they've
// seen. Kept apart from the event's members so it's never sent to the other
// members (no read receipts), and so marking a chat read doesn't rewrite the
// event.
const chatReadSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastRead: { type: mongoose.Schema.Types.ObjectId, required: true }
});

chatReadSchema.index({ user: 1, event: 1 }, { unique: true });

module.exports = mongoose.model('ChatRead', chatReadSchema);
