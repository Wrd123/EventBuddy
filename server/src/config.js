// Reads settings from environment variables (server/.env in development).
// Production must set everything explicitly; development falls back to
// safe defaults so `npm run dev` works with no setup.
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

const required = (name) => {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return process.env[name];
};

// Which proxies may tell us the client's real IP (X-Forwarded-For), used by
// the login rate limiter. Default: only proxies on this machine, like the
// web app's dev proxy. Behind a host's load balancer, set e.g. TRUST_PROXY=1
// (one proxy hop). Never "true": anyone could then fake their IP.
const parseTrustProxy = (value) => {
  if (!value) return 'loopback';
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'false') return false;
  return value;
};

const jwtSecret = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (isProduction) return required('JWT_SECRET');
  // Random per run: fine for development, but logins end when the server restarts
  return crypto.randomBytes(32).toString('hex');
})();

module.exports = {
  env,
  isProduction,
  isTest: env === 'test',
  port: Number(process.env.PORT) || 4000,
  // Unset in development means "use an in-memory database"
  mongoUri: isProduction ? required('MONGODB_URI') : process.env.MONGODB_URI,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10
};
