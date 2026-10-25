// /api/events/:id/messages: the event's group chat.
//
// Every member can read and post. The app polls for new messages with
// ?after=<newest id it has>, and pages back through history with
// ?before=<oldest id it has>. Message ids increase over time, so they work
// as cursors and never skip or repeat a message the way timestamps can.
const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const Message = require('../models/Message');
const ChatRead = require('../models/ChatRead');
const { MAX_MESSAGE_LENGTH } = require('../models/Message');
const { HttpError } = require('../errors');
const { text } = require('../validation');
const { findVisibleEvent } = require('../eventAccess');
const { readClientId, createOnce } = require('../idempotency');
const { isTest } = require('../config');

const PAGE_SIZE = 50;
// Polling after a long time away catches up this many at a time
const CATCH_UP_SIZE = 100;

// Enough for a fast conversation, not for flooding everyone's phones
const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user._id.toString(),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
  message: { message: "You're sending messages too fast. Wait a moment and try again." }
});

// A message id from the query or body, or a 400
const messageId = (value) => {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
    throw new HttpError(400, 'Invalid message id.');
  }
  return new mongoose.Types.ObjectId(value);
};

const router = express.Router({ mergeParams: true });

// -> { messages: oldest first, hasMore } (hasMore only when paging back)
router.get('/', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const { after, before } = req.query;

  if (after !== undefined) {
    const messages = await Message.find({ event: event._id, _id: { $gt: messageId(after) } })
      .sort({ _id: 1 })
      .limit(CATCH_UP_SIZE);
    return res.json({ messages });
  }

  const filter = { event: event._id };
  if (before !== undefined) filter._id = { $lt: messageId(before) };
  // One extra tells us whether there's more history before this page
  const newest = await Message.find(filter).sort({ _id: -1 }).limit(PAGE_SIZE + 1);
  res.json({ messages: newest.slice(0, PAGE_SIZE).reverse(), hasMore: newest.length > PAGE_SIZE });
});

router.post('/', sendLimiter, async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  const body = text(req.body.text);
  if (!body) throw new HttpError(400, 'Write a message first.');
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new HttpError(400, `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`);
  }

  // A retried send that was already saved gets the saved message back
  const key = { event: event._id, 'sender.user': req.user._id, clientId: readClientId(req.body) };
  const member = event.members.find((m) => m.user.equals(req.user._id));
  const { record: message, created } = await createOnce(Message, key, {
    event: event._id,
    sender: { user: req.user._id, name: member?.name || req.user.name },
    text: body
  }, (saved) => saved.text === body);
  res.status(created ? 201 : 200).json({ message });
});

// Marks the chat read up to a message. Only ever moves forward, so a slow
// request from an older screen can't make read messages unread again.
router.put('/read', async (req, res) => {
  const event = await findVisibleEvent(req.params.id, req.user);
  await ChatRead.updateOne(
    { user: req.user._id, event: event._id },
    { $max: { lastRead: messageId(req.body.lastRead) } },
    { upsert: true }
  );
  res.status(204).end();
});

module.exports = router;
