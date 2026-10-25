const mongoose = require('mongoose');
const { ISO_DATE } = require('./Event');
const { MAX_CENTS, personSchema, wholeCents } = require('./Expense');
const { clientIdIndex } = require('../idempotency');

// A settle-up payment one member made to another ("Alex paid Taylor $40"),
// recorded so balances account for it
const paymentSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    from: { type: personSchema, required: true },
    to: { type: personSchema, required: true },
    amountCents: { type: Number, required: true, min: 1, max: MAX_CENTS, validate: wholeCents },
    date: { type: String, required: true, match: ISO_DATE },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // The app's own id for this "Mark paid", so a retry can't record it twice
    clientId: { type: String }
  },
  { timestamps: true }
);

clientIdIndex(paymentSchema, { event: 1, createdBy: 1 });

paymentSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Payment', paymentSchema);
