const bcrypt = require('bcryptjs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { signToken, requireAuth } = require('../middleware/auth');
const { HttpError } = require('../errors');
const { validateRegistration, cleanPaymentHandles, text, MAX_NAME_LENGTH } = require('../validation');
const config = require('../config');
const { DEMO_LOGIN } = require('../seed/demoData');

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

// One-tap sign-in as the demo user, for people trying the app. Only in
// demo mode, where the demo data is public anyway; elsewhere it doesn't exist.
router.post('/demo', attemptLimiter, async (req, res) => {
  if (!config.demoMode) throw new HttpError(404, 'Not found.');
  const user = await User.findOne({ email: DEMO_LOGIN.email });
  if (!user) throw new HttpError(503, 'The demo is still getting ready. Try again in a moment.');
  res.json({ token: signToken(user), user });
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

module.exports = router;
