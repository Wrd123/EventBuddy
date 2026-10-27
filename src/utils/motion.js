// True when animations should be skipped. jsdom has no matchMedia; treating
// that as "reduced motion" makes things happen at once in tests instead of
// waiting on an animationend or transitionend that never fires. Real browsers
// always have it.
export const prefersReducedMotion = () =>
  typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
