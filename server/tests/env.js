// Loaded first by helpers.js, before config.js reads the environment.
// NODE_ENV=test turns off the login rate limiter and error logging.
// The cheapest bcrypt cost keeps password hashing from slowing tests down.
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = 'test-secret';
delete process.env.MONGODB_URI;
