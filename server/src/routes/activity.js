// /api/events/:id/activity: what's been happening in the event, newest
// first, for its members only. The routes that make each change write the
// lines (see activityLog.js).
//
// The app reads the newest page whenever the event changes, and pages back
// with ?before=<oldest id it has>. Ids increase over time, so they work as
// cursors, as in the chat.
const express = require('express');
const mongoose = require('mongoose');
const Activity = require('../models/Activity');
const { HttpError } = require('../errors');
const { findVisibleEvent } = require('../eventAccess');

const PAGE_SIZE = 20;

const router = express.Router({ mergeParams: true });

// -> { activity: newest first, hasMore }
router.get('/', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const filter = { event: event._id };
  const { before } = req.query;
  if (before !== undefined) {
    if (typeof before !== 'string' || !mongoose.isValidObjectId(before)) {
      throw new HttpError(400, 'Invalid activity id.');
    }
    filter._id = { $lt: new mongoose.Types.ObjectId(before) };
  }
  // One extra tells us whether there's more before this page
  const newest = await Activity.find(filter).sort({ _id: -1 }).limit(PAGE_SIZE + 1);
  res.json({ activity: newest.slice(0, PAGE_SIZE), hasMore: newest.length > PAGE_SIZE });
});

module.exports = router;
module.exports.PAGE_SIZE = PAGE_SIZE;
