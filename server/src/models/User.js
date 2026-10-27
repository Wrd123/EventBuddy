const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { bcryptRounds } = require('../config');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    // select: false keeps the hash out of every query unless asked for
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String, default: null },
    // Where friends can send this person money. Shown only to people who
    // share an event with them (see GET /api/events/:id/payment-handles).
    // Set on accounts in a private demo world (see seed/demoData.js)
    demoWorld: { type: String, index: true },
    // Goes up on logout and password change. Every login token carries the
    // number it was issued with, and a token with an older one is refused,
    // so ending a session ends it on the server, not just on the phone.
    // A demo world rebuilt from its token after the server restarts empty
    // starts over at 0, so a logged-out demo token works again then. Demo
    // worlds hold only sample data and have no password, so that's accepted.
    sessionVersion: { type: Number, default: 0 },
    paymentHandles: {
      venmo: { type: String, default: '' },
      cashapp: { type: String, default: '' },
      paypal: { type: String, default: '' },
      zelle: { type: String, default: '' }
    }
  },
  { timestamps: true }
);

userSchema.statics.hashPassword = (password) => bcrypt.hash(password, bcryptRounds);

userSchema.methods.checkPassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

// Never send the password hash to a client, even if a query selected it
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    // The app only needs to know it's a demo account (no password to change)
    ret.isDemo = Boolean(ret.demoWorld);
    delete ret.demoWorld;
    delete ret.sessionVersion;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
