const mongoose = require('mongoose');

// Someone sharing where they are with the rest of an event, until a time
// they chose. Only the latest position is kept: each update overwrites the
// last, so there's never a trail of where someone has been. MongoDB deletes
// the whole record soon after `until` (the TTL index below), and reads
// ignore expired ones before that happens.
const locationShareSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  until: { type: Date, required: true },
  // Unset until the phone sends its first position
  lat: { type: Number, default: null, min: -90, max: 90 },
  lng: { type: Number, default: null, min: -180, max: 180 },
  // Meters, as reported by the phone; shown as a fuzzier pin when large
  accuracy: { type: Number, default: null, min: 0 },
  positionAt: { type: Date, default: null }
});

locationShareSchema.index({ event: 1, user: 1 }, { unique: true });
locationShareSchema.index({ until: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('LocationShare', locationShareSchema);
