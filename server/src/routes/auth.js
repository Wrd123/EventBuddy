const bcrypt = require('bcryptjs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { signToken, requireAuth } = require('../middleware/auth');
const { HttpError } = require('../errors');
const { validateRegistration, validatePassword, cleanPaymentHandles, text, MAX_NAME_LENGTH } = require('../validation');
const config = require('../config');
const { createDemoWorld, pruneDemoWorlds, dayIn } = require('../seed/demoData');

const { isTest, bcryptRounds } = config;

const router = express.Router();

// Slow down password guessing: 20 login/register attempts per 15 minutes
// per IP. Not applied to /me, which every app launch calls.
const attemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
  message: { message: 'Too many attempts. Please wait a few minutes and try again.' }
});

// Compared against when the email doesn't exist, so a wrong email takes as
// long as a wrong password and response time doesn't reveal who has an account
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', bcryptRounds);

router.post('/register', attemptLimiter, async (req, res) => {
  const email = text(req.body.email).toLowerCase();
  const username = text(req.body.username).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const fullName = `${text(req.body.firstName)} ${text(req.body.lastName)}`.trim();
  const name = (text(req.body.name) || fullName || username).slice(0, MAX_NAME_LENGTH);

  const error = validateRegistration({ email, username, password });
  if (error) throw new HttpError(400, error);

  // Friendly messages for the common cases; the unique indexes still catch
  // a race between two simultaneous sign-ups
  if (await User.exists({ email })) {
    throw new HttpError(409, 'An account with this email already exists.');
  }
  if (await User.exists({ username })) {
    throw new HttpError(409, 'That username is taken.');
  }

  const user = await User.create({
    email,
    username,
    name,
    passwordHash: await User.hashPassword(password)
  });

  res.status(201).json({ token: signToken(user), user });
});

router.post('/login', attemptLimiter, async (req, res) => {
  const email = text(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  const user = await User.findOne({ email }).select('+passwordHash');
  let passwordMatches = false;
  if (user) {
    passwordMatches = await user.checkPassword(password);
  } else {
    await bcrypt.compare(password, DUMMY_HASH);
  }

  // Same message either way: don't reveal whether the email is registered
  if (!user || !passwordMatches) {
    throw new HttpError(401, 'Invalid email or password');
  }

  res.json({ token: signToken(user), user });
});

// Private demo worlds last a day, and at most this many are kept
const DEMO_WORLD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_DEMO_WORLDS = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

// The visitor's own date, if it's a real calendar day within one of ours
// (time zones span about a day either side of UTC)
const visitorToday = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const now = Date.now();
  return value >= dayIn('UTC', now - DAY_MS) && value <= dayIn('UTC', now + DAY_MS) ? value : undefined;
};

// One-tap sign-in for people trying the app, as John in a private copy of
// the demo: what one visitor changes, the next never sees. Only in demo
// mode; elsewhere it doesn't exist. body.today puts the picnic on the
// visitor's today. No IP attempt limit (there's no password to guess, and
// where client IPs can't be read reliably a shared limit would lock everyone
// out); pruning bounds how many worlds exist instead.
router.post('/demo', async (req, res) => {
  if (!config.demoMode) throw new HttpError(404, 'Not found.');
  await pruneDemoWorlds({ maxAgeMs: DEMO_WORLD_MAX_AGE_MS, maxWorlds: MAX_DEMO_WORLDS });
  const user = await createDemoWorld({ today: visitorToday(req.body?.today) });
  res.status(201).json({ token: signToken(user), user });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Update your name and/or payment handles; only the fields sent change
router.patch('/me', requireAuth, async (req, res) => {
  if ('name' in req.body) {
    const name = text(req.body.name);
    if (!name) throw new HttpError(400, 'Please enter your name.');
    if (name.length > MAX_NAME_LENGTH) {
      throw new HttpError(400, `Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
    }
    req.user.name = name;
  }

  if ('paymentHandles' in req.body) {
    const { handles, error } = cleanPaymentHandles(req.body.paymentHandles);
    if (error) throw new HttpError(400, error);
    for (const [service, value] of Object.entries(handles)) {
      req.user.paymentHandles[service] = value;
    }
  }

  await req.user.save();
  res.json({ user: req.user });
});

// Matches a user whose session version is still the one this request was
// checked against. Accounts made before versions existed have none stored,
// which counts as the first.
const sameSession = (user) => ({ _id: user._id, sessionVersion: user.sessionVersion || { $in: [0, null] } });

// Ends the session on the server: this token, and any copy of it, stops
// working. It ends the login on every device, which is the honest meaning
// of "log out" while there's one session version per person.
router.post('/logout', requireAuth, async (req, res) => {
  await User.updateOne(sameSession(req.user), { $inc: { sessionVersion: 1 } });
  res.status(204).end();
});

// Change your password. Body: { currentPassword, newPassword }. Logs out
// every other device and returns a new token for this one. Counted with
// login attempts, since it also checks a password.
router.post('/password', requireAuth, attemptLimiter, async (req, res) => {
  const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

  const user = await User.findById(req.user._id).select('+passwordHash');
  // 400, not 401: the app treats a 401 as "your session ended" and logs out
  if (!(await user.checkPassword(currentPassword))) {
    throw new HttpError(400, "Your current password isn't right.");
  }
  const error = validatePassword(newPassword, user);
  if (error) throw new HttpError(400, error);
  if (await user.checkPassword(newPassword)) {
    throw new HttpError(400, 'Choose a password different from your current one.');
  }

  // Only if nothing ended this session meanwhile (a logout elsewhere)
  const updated = await User.findOneAndUpdate(
    sameSession(req.user),
    { $set: { passwordHash: await User.hashPassword(newPassword) }, $inc: { sessionVersion: 1 } },
    { returnDocument: 'after' }
  );
  if (!updated) throw new HttpError(401, 'Your session has expired. Please log in again.');
  res.json({ token: signToken(updated), user: updated });
});

module.exports = router;
