const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { jwtSecret, jwtExpiresIn } = require('../config');
const { HttpError } = require('../errors');

const signToken = (user) =>
  jwt.sign({ sub: user._id.toString() }, jwtSecret, {
    algorithm: 'HS256',
    expiresIn: jwtExpiresIn
  });

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

  const user = await User.findById(payload.sub);
  if (!user) {
    throw new HttpError(401, 'Your session has expired. Please log in again.');
  }

  req.user = user;
  next();
};

module.exports = { signToken, requireAuth };
