const mongoose = require('mongoose');
const { personSchema } = require('./Expense');

// One line of an event's recent activity ("Taylor set the meetup point").
// The actor's name is copied in, like a chat sender's, so the line still
// reads right after they leave. data keeps only what the sentence needs,
// and the schema is the guarantee: anything else, like a position or a
// meetup note, is dropped rather than stored.
const KINDS = [
  'joined',
  'left',
  'schedule_added',
  'expense_added',
  'payment_marked',
  'meetup_set',
  'sharing_started',
  'event_updated'
];

// The event details an edit can change, as named in event_updated lines
const EVENT_FIELDS = ['name', 'type', 'startDate', 'endDate', 'location', 'description', 'ticketUrl', 'budgetCents'];

// Old lines are only cleared to keep the collection small; nothing
// promises how far back the history goes
const KEEP_FOR_SECONDS = 30 * 24 * 60 * 60;

const dataSchema = new mongoose.Schema(
  {
    // schedule_added: the plan's title
    activity: String,
    // expense_added
    description: String,
    // expense_added and payment_marked
    amountCents: Number,
    // payment_marked
    from: personSchema,
    to: personSchema,
    // event_updated: which details changed, never what they changed to
    fields: { type: [{ type: String, enum: EVENT_FIELDS }], default: undefined }
  },
  { _id: false }
);

const activitySchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    actor: { type: personSchema, required: true },
    kind: { type: String, enum: KINDS, required: true },
    // The schedule item, expense or payment the line is about, so the line
    // can follow it when it changes or goes
    subject: { type: mongoose.Schema.Types.ObjectId },
    data: { type: dataSchema, default: () => ({}) }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Pages by _id (ObjectIds increase over time), newest first, like the chat
activitySchema.index({ event: 1, _id: -1 });
activitySchema.index({ event: 1, subject: 1 });
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: KEEP_FOR_SECONDS });

activitySchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Activity', activitySchema);
module.exports.KINDS = KINDS;
module.exports.EVENT_FIELDS = EVENT_FIELDS;
