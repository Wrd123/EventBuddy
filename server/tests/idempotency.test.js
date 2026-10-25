const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createOnce, readClientId } = require('../src/idempotency');
const { withEventLock, pendingLocks } = require('../src/eventLock');

// A stand-in for a Mongoose model, so the race branch runs every time
// instead of only when two real requests happen to collide
const fakeModel = ({ findOne, create }) => ({ findOne: async (...args) => findOne(...args), create: async (doc) => create(doc) });
const matchesAll = () => true;

describe('createOnce', () => {
  it('returns the winner when another try saved the same clientId first', async () => {
    const winner = { _id: 'm1', text: 'hi' };
    let lookups = 0;
    const Model = fakeModel({
      findOne: () => (lookups++ === 0 ? null : winner),
      create: () => {
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000, keyPattern: { event: 1, createdBy: 1, clientId: 1 } });
      }
    });

    assert.deepEqual(await createOnce(Model, { clientId: 'abc' }, { text: 'hi' }, matchesAll), { record: winner, created: false });
  });

  it('passes on a clash with some other unique index', async () => {
    const clash = Object.assign(new Error('E11000 duplicate key'), { code: 11000, keyPattern: { email: 1 } });
    const Model = fakeModel({ findOne: () => null, create: () => { throw clash; } });

    await assert.rejects(createOnce(Model, { clientId: 'abc' }, {}, matchesAll), clash);
  });

  it('creates without looking anything up when there is no clientId', async () => {
    const Model = fakeModel({ findOne: () => assert.fail('no lookup expected'), create: (doc) => ({ ...doc, _id: 'm2' }) });
    assert.deepEqual(await createOnce(Model, { clientId: undefined }, { text: 'hi' }, matchesAll), {
      record: { text: 'hi', _id: 'm2' },
      created: true
    });
  });
});

describe('readClientId', () => {
  it('accepts a plain id and treats a missing one as none', () => {
    assert.equal(readClientId({ clientId: '0c9b-41aa_x' }), '0c9b-41aa_x');
    assert.equal(readClientId({}), undefined);
  });
});

describe('withEventLock', () => {
  it("runs one event's changes one at a time, in order", async () => {
    const order = [];
    let finishFirst;
    const first = withEventLock('e1', () => new Promise((resolve) => { finishFirst = resolve; }).then(() => order.push('first')));
    const second = withEventLock('e1', async () => order.push('second'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(order, []);

    finishFirst();
    await Promise.all([first, second]);
    assert.deepEqual(order, ['first', 'second']);
  });

  it('treats an id spelled in capitals as the same event', async () => {
    const order = [];
    let finishFirst;
    const first = withEventLock('65abcdef0123456789abcdef', () => new Promise((resolve) => { finishFirst = resolve; }).then(() => order.push('first')));
    const second = withEventLock('65ABCDEF0123456789ABCDEF', async () => order.push('second'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(order, []);

    finishFirst();
    await Promise.all([first, second]);
    assert.deepEqual(order, ['first', 'second']);
  });

  it("doesn't make other events wait", async () => {
    let finishSlow;
    const slow = withEventLock('e1', () => new Promise((resolve) => { finishSlow = resolve; }));
    assert.equal(await withEventLock('e2', async () => 'done'), 'done');
    finishSlow();
    await slow;
  });

  it('keeps going after a change fails, and forgets idle events', async () => {
    await assert.rejects(withEventLock('e3', async () => { throw new Error('boom'); }), /boom/);
    assert.equal(await withEventLock('e3', async () => 'next'), 'next');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(pendingLocks(), 0);
  });
});
