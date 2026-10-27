import { prefersReducedMotion } from './motion';

describe('prefersReducedMotion', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it('counts a missing matchMedia as reduced motion, as in tests', () => {
    window.matchMedia = undefined;
    expect(prefersReducedMotion()).toBe(true);
  });

  it('follows the reduced-motion setting when the browser reports it', () => {
    window.matchMedia = jest.fn(() => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    window.matchMedia = jest.fn(() => ({ matches: true }));
    expect(prefersReducedMotion()).toBe(true);
  });
});
