// Loaded first by helpers.js, before config.js reads the environment.
// NODE_ENV=test turns off the login rate limiter and error logging.
// The cheapest bcrypt cost keeps password hashing from slowing tests down.
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = 'test-secret';
process.env.TICKETMASTER_API_KEY = 'test-ticketmaster-key';
process.env.NOMINATIM_MIN_INTERVAL_MS = '0';
delete process.env.MONGODB_URI;
