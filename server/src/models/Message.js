const mongoose = require('mongoose');
const { personSchema } = require('./Expense');
const { clientIdIndex } = require('../idempotency');

const MAX_MESSAGE_LENGTH = 1000;

// A message in an event's group chat. The sender's name is copied in, like
// event members, so the chat renders without user lookups and still reads
// right if someone later leaves the event.
const messageSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    sender: { type: personSchema, required: true },
    text: { type: String, required: true, trim: true, maxlength: MAX_MESSAGE_LENGTH },
    // The app's own id for this send, so a retry can't post it twice
    clientId: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Chats page by _id (ObjectIds increase over time), newest first
messageSchema.index({ event: 1, _id: -1 });
clientIdIndex(messageSchema, { event: 1, 'sender.user': 1 });

messageSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Message', messageSchema);
module.exports.MAX_MESSAGE_LENGTH = MAX_MESSAGE_LENGTH;
