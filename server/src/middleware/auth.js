const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');
const { HttpError } = require('../errors');
const { createDemoWorld, demoWorldUserId } = require('../seed/demoData');

const { jwtSecret, jwtExpiresIn } = config;

// A private demo account's token also names its world, so the world can be
// rebuilt if the server restarts with an empty database
const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), ...(user.demoWorld && { world: user.demoWorld }) }, jwtSecret, {
    algorithm: 'HS256',
    expiresIn: jwtExpiresIn
  });

// Rebuilds a demo world for a token whose account is gone: a hosted demo
// that slept and woke with a fresh database, or a world pruned for age.
// Requests arriving together share one rebuild.
const rebuilding = new Map();
const rebuildDemoWorld = async ({ sub, world }) => {
  if (!config.demoMode || !world || !demoWorldUserId(world).equals(sub)) return null;
  if (!rebuilding.has(world)) {
    rebuilding.set(world, createDemoWorld({ tag: world }).finally(() => rebuilding.delete(world)));
  }
  return rebuilding.get(world);
};

// Requires "Authorization: Bearer <token>" and loads the user onto req.user.
// The user comes from the token, never from the request body, so nobody can
// act as someone else by sending a different id.
const requireAuth = async (req, res, next) => {
  const [scheme, token] = (req.get('Authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Please log in.');
  }

  let payload;
  try {
    // Pin the algorithm so a token can't pick a weaker one
    payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'Your session has expired. Please log in again.');
  }

  const user = (await User.findById(payload.sub)) || (await rebuildDemoWorld(payload));
  if (!user) {
    throw new HttpError(401, 'Your session has expired. Please log in again.');
  }

  req.user = user;
  next();
};

module.exports = { signToken, requireAuth };
