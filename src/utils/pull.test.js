import { PULL_MAX, PULL_THRESHOLD, pullDistance, pullProgress } from './pull';

describe('pullDistance', () => {
  it('is zero when the finger has not moved down', () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-20)).toBe(0);
    expect(pullDistance(NaN)).toBe(0);
  });

  it('only ever grows as the finger goes further', () => {
    let previous = 0;
    for (let dy = 1; dy <= 600; dy += 7) {
      const distance = pullDistance(dy);
      expect(distance).toBeGreaterThan(previous);
      previous = distance;
    }
  });

  it('never goes past the maximum', () => {
    expect(pullDistance(300)).toBeLessThan(PULL_MAX);
    expect(pullDistance(100000)).toBeLessThanOrEqual(PULL_MAX);
  });

  it('eases off: the same extra travel moves the content less the further you are', () => {
    expect(pullDistance(40) - pullDistance(0)).toBeGreaterThan(pullDistance(240) - pullDistance(200));
  });

  it('reaches the threshold with a reasonable finger travel', () => {
    expect(pullDistance(80)).toBeLessThan(PULL_THRESHOLD);
    expect(pullDistance(140)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
  });
});

describe('pullProgress', () => {
  it('is zero at rest and for nonsense', () => {
    expect(pullProgress(0)).toBe(0);
    expect(pullProgress(-5)).toBe(0);
  });

  it('is relative to the threshold', () => {
    expect(pullProgress(PULL_THRESHOLD / 2)).toBeCloseTo(0.5);
    expect(pullProgress(PULL_THRESHOLD)).toBe(1);
  });

  it('stops at one however far the pull goes', () => {
    expect(pullProgress(PULL_MAX)).toBe(1);
    expect(pullProgress(1000)).toBe(1);
  });
});
