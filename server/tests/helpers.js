// Must load before anything that reads config (models, app)
require('./env');

const assert = require('node:assert/strict');
const { before, afterEach, after } = require('node:test');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/app');

let mongo;

// A fresh in-memory MongoDB per test file (node --test runs each file in its
// own process), emptied between tests
const useTestDatabase = () => {
  // Starting mongod takes a few seconds, longer the first time while the
  // binary downloads. No /tmp socket file, as in src/db.js, so the tests also
  // run in a sandboxed shell.
  before(async () => {
    mongo = await MongoMemoryServer.create({ instance: { args: ['--nounixsocket'] } });
    await mongoose.connect(mongo.getUri());
  }, { timeout: 120000 });

  afterEach(async () => {
    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });

  after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
};

const app = createApp();
const api = () => request(app);

let userCount = 0;

// Registers a new user through the API; returns { token, user, auth }
// where auth is the Authorization header value
const registerUser = async (overrides = {}) => {
  userCount += 1;
  const res = await api()
    .post('/api/auth/register')
    .send({
      firstName: 'Test',
      lastName: `User${userCount}`,
      username: `user${userCount}`,
      email: `user${userCount}@example.com`,
      password: 'secret123',
      ...overrides
    })
    .expect(201);
  return { ...res.body, auth: `Bearer ${res.body.token}` };
};

// Asserts that each key in expected deep-equals the same key in actual,
// ignoring any other keys actual has
const assertFields = (actual, expected) => {
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(actual[key], value, `field "${key}"`);
  }
};

module.exports = { useTestDatabase, api, registerUser, assertFields };
