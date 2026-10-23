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
    avatar: { type: String, default: null }
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
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
