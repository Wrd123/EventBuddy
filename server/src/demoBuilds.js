const { HttpError } = require('./errors');
const { createConcurrencyLimit } = require('./concurrencyLimit');
// The module itself, not its functions, so a test can hold the work up
const demoData = require('./seed/demoData');

// Private demo worlds last a day, and at most this many are kept
const DEMO_WORLD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_DEMO_WORLDS = 300;
// Far more than people tapping "Try the demo" at the same moment
const MAX_DEMO_BUILDS_AT_ONCE = 5;

// Every way a world gets built shares this one budget: a new visitor's tap
// and a saved login whose world has to be rebuilt both come through here, so
// no mix of them can make a small free server do more than this at once.
const limit = createConcurrencyLimit(MAX_DEMO_BUILDS_AT_ONCE, () => {
  const err = new HttpError(503, 'The demo is busy right now. Try again in a moment.');
  // Nothing was started, which lets a caller refund what the visit cost
  err.busy = true;
  return err;
});

// Prunes old worlds, then runs fn (which builds one), inside the limit.
// Pruning is inside it too, so a burst can't run many prunes at once.
const buildWorld = (fn) => limit(async () => {
  await demoData.pruneDemoWorlds({ maxAgeMs: DEMO_WORLD_MAX_AGE_MS, maxWorlds: MAX_DEMO_WORLDS });
  return fn();
});

// How many are being built right now, for tests that wait for them to end
buildWorld.running = limit.running;

module.exports = { buildWorld };
