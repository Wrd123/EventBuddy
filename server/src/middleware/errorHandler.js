const mongoose = require('mongoose');
const { HttpError } = require('../errors');
const { isTest } = require('../config');

// Unknown /api routes
const notFound = (req, res) => {
  res.status(404).json({ message: 'Not found.' });
};

// Express 5 forwards errors thrown in async handlers here.
// Every response is { message }, which the client shows to the user.
// eslint-disable-next-line no-unused-vars -- Express needs all four arguments
const errorHandler = (err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const first = Object.values(err.errors)[0];
    return res.status(400).json({ message: first?.message || 'Invalid data.' });
  }
  // Malformed ObjectId in a URL: treat like a missing record
  if (err instanceof mongoose.Error.CastError) {
    return res.status(404).json({ message: 'Not found.' });
  }
  // Unique index violation (e.g. email already registered)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    return res.status(409).json({ message: `That ${field} is already in use.` });
  }
  // Bad JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON.' });
  }
  // Body over the size limit (app.js): the client's to fix, not a crash
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: "That's too much to send at once." });
  }

  if (!isTest) console.error(err);
  // Don't leak internals to clients
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
};

module.exports = { notFound, errorHandler };
