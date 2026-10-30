import { GLIDE_MAX_MS, SNAP_AFTER_MS, glideDuration, pointAt } from './glide';

describe('glideDuration', () => {
  it('lasts as long as the time between the two fixes', () => {
    expect(glideDuration(10000, 12000)).toBe(2000);
  });

  it('never lasts longer than the cap', () => {
    expect(glideDuration(0, 5000)).toBe(GLIDE_MAX_MS);
    expect(glideDuration(0, SNAP_AFTER_MS)).toBe(GLIDE_MAX_MS);
  });

  it('still glides across a gap as long as the 10 s fallback poll, with room to spare', () => {
    expect(glideDuration(0, 10000)).toBe(GLIDE_MAX_MS);
    expect(glideDuration(0, 12000)).toBe(GLIDE_MAX_MS);
  });

  it('is 0 (jump) with no earlier fix', () => {
    expect(glideDuration(undefined, 5000)).toBe(0);
    expect(glideDuration(null, 5000)).toBe(0);
  });

  it('is 0 after a gap of more than 15 seconds', () => {
    expect(glideDuration(0, SNAP_AFTER_MS + 1)).toBe(0);
  });

  it('is 0 for a gap that is negative, empty or not a time', () => {
    expect(glideDuration(5000, 4000)).toBe(0);
    expect(glideDuration(5000, 5000)).toBe(0);
    expect(glideDuration(NaN, 5000)).toBe(0);
    expect(glideDuration(1000, undefined)).toBe(0);
  });
});

describe('pointAt', () => {
  const from = { lat: 10, lng: 20 };
  const to = { lat: 12, lng: 24 };

  it('moves in a straight line at a steady speed', () => {
    expect(pointAt(from, to, 1000, 2000, 1000)).toEqual(from);
    expect(pointAt(from, to, 1000, 2000, 1500)).toEqual({ lat: 10.5, lng: 21 });
    expect(pointAt(from, to, 1000, 2000, 2000)).toEqual({ lat: 11, lng: 22 });
  });

  it('stops at the target and goes no further', () => {
    expect(pointAt(from, to, 1000, 2000, 3000)).toEqual(to);
    expect(pointAt(from, to, 1000, 2000, 9000)).toEqual(to);
  });

  it('stays at the start before it begins', () => {
    expect(pointAt(from, to, 1000, 2000, 500)).toEqual(from);
  });

  it('is at the target at once with no duration', () => {
    expect(pointAt(from, to, 1000, 0, 1000)).toEqual(to);
  });
});
