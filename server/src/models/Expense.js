const mongoose = require('mongoose');
const { ISO_DATE } = require('./Event');

// Money is stored as whole cents. Decimal dollars drift in floating point
// (0.1 + 0.2 !== 0.3), and split totals have to add up exactly.
const MAX_CENTS = 10000000; // $100,000
const wholeCents = { validator: Number.isInteger, message: 'Amounts must be whole cents' };

// A member involved in money: the user plus their name, copied in like
// event members so the ledger renders without user lookups
const personSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true }
  },
  { _id: false }
);

// One person's part of an expense
const shareSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    amountCents: { type: Number, required: true, min: 0, validate: wholeCents }
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 80 },
    amountCents: { type: Number, required: true, min: 1, max: MAX_CENTS, validate: wholeCents },
    date: { type: String, required: true, match: ISO_DATE },
    paidBy: { type: personSchema, required: true },
    // How the shares were chosen; the shares themselves are always stored
    splitType: { type: String, enum: ['equal', 'exact'], default: 'equal' },
    shares: [shareSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

expenseSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Expense', expenseSchema);
module.exports.MAX_CENTS = MAX_CENTS;
module.exports.personSchema = personSchema;
module.exports.wholeCents = wholeCents;
