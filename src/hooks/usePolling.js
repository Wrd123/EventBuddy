import { useEffect, useRef } from 'react';

export const isVisible = () => document.visibilityState !== 'hidden';

// Runs fn now and every intervalMs while the app is on screen, and again as
// soon as it comes back to the foreground. A phone in a pocket doesn't poll.
export const usePolling = (fn, intervalMs) => {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const tick = () => isVisible() && fnRef.current();
    const timer = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
};
