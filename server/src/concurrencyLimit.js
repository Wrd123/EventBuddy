// At most max of a kind of work at once; more is turned away straight away
// with busy() rather than queued, so a burst can't pile up work (and
// memory) the server would still be doing long after the callers gave up.
// Only counts within this process, like eventLock.js.
const createConcurrencyLimit = (max, busy) => {
  let running = 0;
  const run = async (fn) => {
    if (running >= max) throw busy();
    running += 1;
    try {
      return await fn();
    } finally {
      running -= 1;
    }
  };
  run.running = () => running;
  return run;
};

module.exports = { createConcurrencyLimit };
