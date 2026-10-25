import { createFreshness } from './freshness';

describe('createFreshness', () => {
  it('accepts a read when nothing happened meanwhile', () => {
    const tracker = createFreshness();
    expect(tracker.accept(tracker.start())).toBe(true);
  });

  it('drops a read that started before a local change', () => {
    const tracker = createFreshness();
    const read = tracker.start();
    tracker.changed();
    expect(tracker.accept(read)).toBe(false);
    // A read started after the change is fine
    expect(tracker.accept(tracker.start())).toBe(true);
  });

  it('drops an older read that lands after a newer one', () => {
    const tracker = createFreshness();
    const older = tracker.start();
    const newer = tracker.start();
    expect(tracker.accept(newer)).toBe(true);
    expect(tracker.accept(older)).toBe(false);
  });

  it('accepts reads that land in the order they started', () => {
    const tracker = createFreshness();
    const first = tracker.start();
    const second = tracker.start();
    expect(tracker.accept(first)).toBe(true);
    expect(tracker.accept(second)).toBe(true);
  });
});
