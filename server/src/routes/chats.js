// /api/chats: the Groups tab. One chat per event you're in, with its latest
// message and how many messages you haven't read, most recent activity first.
const express = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Message = require('../models/Message');
const ChatRead = require('../models/ChatRead');
const { requireAuth } = require('../middleware/auth');
const { visibleTo } = require('../eventAccess');

// Sorts before every real id: "nothing read yet"
const BEFORE_ALL = new mongoose.Types.ObjectId('000000000000000000000000');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const me = req.user._id;
  const events = await Event.find(visibleTo(req.user))
    .select('name type coverIndex startDate endDate members')
    .lean();
  if (events.length === 0) return res.json({ chats: [] });
  const ids = events.map((e) => e._id);

  const [latest, reads] = await Promise.all([
    Message.aggregate([
      { $match: { event: { $in: ids } } },
      { $sort: { _id: -1 } },
      { $group: { _id: '$event', message: { $first: '$$ROOT' } } }
    ]),
    ChatRead.find({ user: me, event: { $in: ids } }).lean()
  ]);
  const lastRead = new Map(reads.map((r) => [r.event.toString(), r.lastRead]));

  // Messages from others after each chat's read point, counted in one query
  const unread = await Message.aggregate([
    {
      $match: {
        'sender.user': { $ne: me },
        $or: ids.map((id) => ({ event: id, _id: { $gt: lastRead.get(id.toString()) || BEFORE_ALL } }))
      }
    },
    { $group: { _id: '$event', count: { $sum: 1 } } }
  ]);

  const latestBy = new Map(latest.map((l) => [l._id.toString(), l.message]));
  const unreadBy = new Map(unread.map((u) => [u._id.toString(), u.count]));

  const chats = events.map((event) => {
    const last = latestBy.get(event._id.toString());
    return {
      eventId: event._id,
      name: event.name,
      type: event.type,
      coverIndex: event.coverIndex,
      startDate: event.startDate,
      endDate: event.endDate,
      memberCount: event.members.length,
      lastMessage: last ? { _id: last._id, text: last.text, sender: last.sender, createdAt: last.createdAt } : null,
      unread: unreadBy.get(event._id.toString()) || 0
    };
  });

  // Latest activity: the newest message, or when the event was created.
  // Whole ids, not their timestamps: those are only to the second, and the
  // rest of an id still increases within a second.
  const activity = (chat) => (chat.lastMessage?._id ?? chat.eventId).toString();
  chats.sort((a, b) => activity(b).localeCompare(activity(a)));

  res.json({ chats });
});

module.exports = router;
