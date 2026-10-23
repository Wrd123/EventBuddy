// /api/invites/:code. Anyone logged in who has an event's invite link can
// see a short preview of it and join. Joining makes you a full member.
const express = require('express');
const Event = require('../models/Event');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../errors');
const { colorForUser } = require('../colors');

const router = express.Router();
router.use(requireAuth);

const INVALID_LINK = "This invite link isn't valid anymore. Ask for a new one.";

const findByCode = async (code) => {
  const event = await Event.findOne({ inviteCode: code });
  if (!event) throw new HttpError(404, INVALID_LINK);
  return event;
};

// Just enough to decide whether to join; the schedule and members' names
// stay private until you do
router.get('/:code', async (req, res) => {
  const event = await findByCode(req.params.code);
  const organizer = event.members.find((m) => m.user.equals(event.createdBy));

  res.json({
    invite: {
      eventId: event._id,
      name: event.name,
      type: event.type,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location,
      organizerName: organizer?.name ?? '',
      memberCount: event.members.length,
      isMember: event.members.some((m) => m.user.equals(req.user._id))
    }
  });
});

router.post('/:code/join', async (req, res) => {
  const me = req.user;

  // One atomic update that only matches if I'm not already a member, so
  // opening the link twice (or two taps at once) can't add me twice
  await Event.updateOne(
    { inviteCode: req.params.code, 'members.user': { $ne: me._id } },
    { $push: { members: { user: me._id, name: me.name, color: colorForUser(me._id) } } }
  );

  // Whether I just joined or was already in, return the event, which I can
  // now see. If the code is wrong, nothing matched above either.
  const event = await findByCode(req.params.code);
  res.json({ event });
});

module.exports = router;
