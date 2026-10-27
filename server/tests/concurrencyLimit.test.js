const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createConcurrencyLimit } = require('../src/concurrencyLimit');

const busy = () => new Error('busy');

// Work that finishes when the test says so
const gated = () => {
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  return { work: () => done, finish };
};

describe('createConcurrencyLimit', () => {
  it('runs work up to the limit at once and turns the next away', async () => {
    const limit = createConcurrencyLimit(2, busy);
    const a = gated();
    const b = gated();

    const first = limit(a.work);
    const second = limit(b.work);
    await assert.rejects(limit(async () => 'third'), /busy/);
    assert.equal(limit.running(), 2);

    a.finish('a');
    b.finish('b');
    assert.deepEqual(await Promise.all([first, second]), ['a', 'b']);
  });

  it('frees a place when work finishes, including when it fails', async () => {
    const limit = createConcurrencyLimit(1, busy);

    await assert.rejects(limit(async () => { throw new Error('broke'); }), /broke/);
    assert.equal(limit.running(), 0);
    assert.equal(await limit(async () => 'next'), 'next');
  });
});
