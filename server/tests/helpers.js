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

// Holds every demo world build at its first step (the pruning that
// buildWorld runs before building), so a test can fill the build limit and
// let go when it chooses. started(n) resolves once n builds are being held;
// release() lets them all finish, and builds after that run as normal.
const holdDemoBuilds = (t) => {
  const demoData = require('../src/seed/demoData');
  const original = demoData.pruneDemoWorlds;
  const held = [];
  const waiting = [];
  let released = false;
  t.mock.method(demoData, 'pruneDemoWorlds', (...args) => {
    if (released) return original(...args);
    return new Promise((resolve) => {
      held.push(() => resolve(original(...args)));
      waiting.filter((w) => held.length >= w.count).forEach((w) => w.resolve());
    });
  });
  return {
    started: (count) => new Promise((resolve, reject) => {
      if (held.length >= count) return resolve();
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${count} held builds`)), 3000);
      waiting.push({ count, resolve: () => { clearTimeout(timer); resolve(); } });
    }),
    release: () => {
      released = true;
      held.splice(0).forEach((resume) => resume());
    }
  };
};

module.exports = { useTestDatabase, api, registerUser, assertFields, holdDemoBuilds };
