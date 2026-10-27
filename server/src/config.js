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

// Demo mode: a public showcase. The database starts fresh from the demo
// data on every start (in memory unless MONGODB_URI is set), and anyone can
// sign in as the demo user with one tap. On by default in development
// without a database; a hosted demo sets DEMO_MODE=true.
const demoMode = process.env.DEMO_MODE === 'true' || (!isProduction && !process.env.MONGODB_URI);

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
  demoMode,
  // Unset in development (or a demo) means "use an in-memory database"
  mongoUri: isProduction && !demoMode ? required('MONGODB_URI') : process.env.MONGODB_URI,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Web app addresses allowed to call the API from a browser; several can
  // be listed, comma-separated
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:3000').split(',').map((o) => o.trim()).filter(Boolean),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // Off unless set: a page showing a visitor the addresses the API sees for
  // their own request, to set TRUST_PROXY from fact. Turn it off afterwards.
  showRequestIp: process.env.SHOW_REQUEST_IP === 'true',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
  // Local events for Discover; unset means Discover explains it's not set up
  ticketmasterApiKey: process.env.TICKETMASTER_API_KEY || '',
  // Identifies us to OpenStreetMap's place lookup, as its policy requires
  nominatimContact: process.env.NOMINATIM_CONTACT || 'https://github.com/Wrd123/EventBuddy',
  // Nominatim allows one request per second; tests set this to 0
  nominatimIntervalMs: process.env.NOMINATIM_MIN_INTERVAL_MS === undefined
    ? 1100
    : Number(process.env.NOMINATIM_MIN_INTERVAL_MS),
  // How long a place lookup may take in all, waiting in line included. Well
  // under the app's 15 second request timeout, so people get an answer
  // ("busy, try again") instead of a request that just times out.
  lookupDeadlineMs: Number(process.env.LOOKUP_DEADLINE_MS) || 10000
};
