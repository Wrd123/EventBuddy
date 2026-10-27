import { useCallback, useEffect, useRef, useState } from 'react';
import PullIndicator, { RING_CIRCUMFERENCE } from '../components/common/PullIndicator';
import { tap, warning } from '../services/haptics';
import { prefersReducedMotion } from '../utils/motion';
import { PULL_THRESHOLD, pullDistance, pullProgress } from '../utils/pull';

// Pull down on a screen's scrolling list to refresh it, the way iOS apps do.
//
//   const { bind, indicator } = usePullToRefresh(reload);
//   <div className="relative flex-1 overflow-hidden">
//     {indicator}
//     <div ref={bind} className="h-full overflow-y-auto overscroll-y-contain">...</div>
//   </div>
//
// - bind goes on the screen's existing scroll container, with no extra
//   wrapper. Give that container overscroll-y-contain (Tailwind), or iOS
//   rubber-bands the whole page on top of our own pull.
// - indicator must be a SIBLING of the container, in a relatively positioned
//   parent. We slide the container itself down with a transform, which leaves
//   the strip above it empty for the ring to sit in. Inside the container, the
//   ring would be dragged down along with the content.
// - onRefresh may return a promise. The latest one is always used.
// - messageTop (px) moves the failure message down, for a screen whose header
//   floats over the top of the list (the event page), so it doesn't cover the
//   header's buttons.

// Where the content rests while the refresh runs
const HOLD_DISTANCE = 56;
// Long enough that a fast refresh doesn't read as a flicker
const MIN_SPIN_MS = 400;
const ERROR_MS = 2500;
const SPRING_MS = 300;
// Movement under this is still "maybe a tap", too early to know the direction
const DIRECTION_SLOP = 6;
const RING_SIZE = 32;
// How much of the ring is drawn while it spins
const SPIN_ARC = 0.7;

export default function usePullToRefresh(onRefresh, { messageTop = 0 } = {}) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const nodeRef = useRef(null);
  const cleanupRef = useRef(null);
  const ringRef = useRef(null);
  const arcRef = useRef(null);
  const refreshingRef = useRef(false);
  const mountedRef = useRef(false);
  const timersRef = useRef(new Set());
  const errorTimerRef = useRef(null);

  const later = useCallback((fn, ms) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      fn();
    }, ms);
    timersRef.current.add(timer);
    return timer;
  }, []);

  // Moves the content and ring to `distance`. With animate, they ease there
  // (unless the person asked for less motion, then they just snap).
  const show = useCallback((distance, { animate = false, arc } = {}) => {
    const node = nodeRef.current;
    const ring = ringRef.current;
    const arcEl = arcRef.current;
    const transition = animate && !prefersReducedMotion() ? `transform ${SPRING_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity ${SPRING_MS}ms` : 'none';
    if (node) {
      node.style.transition = transition;
      node.style.transform = distance > 0 ? `translateY(${distance}px)` : '';
    }
    if (ring) {
      const progress = arc ?? pullProgress(distance);
      ring.style.transition = transition;
      ring.style.opacity = distance > 0 ? String(Math.min(1, progress + 0.2)) : '0';
      // Centered in the strip the content has opened up
      ring.style.transform = `translateY(${distance > 0 ? distance / 2 - RING_SIZE / 2 : -RING_SIZE}px)`;
      if (arcEl) arcEl.setAttribute('stroke-dasharray', `${progress * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`);
    }
  }, []);

  const runRefresh = useCallback(async () => {
    refreshingRef.current = true;
    setRefreshing(true);
    show(HOLD_DISTANCE, { animate: true, arc: SPIN_ARC });
    const startedAt = Date.now();
    let ok = true;
    try {
      await onRefreshRef.current();
    } catch {
      ok = false;
    }
    const remaining = MIN_SPIN_MS - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => later(resolve, remaining));
    if (!mountedRef.current) return;
    refreshingRef.current = false;
    setRefreshing(false);
    show(0, { animate: true });
    if (!ok) {
      warning();
      setFailed(true);
      // A new failure gets its full time on screen, not what's left of the last
      clearTimeout(errorTimerRef.current);
      timersRef.current.delete(errorTimerRef.current);
      errorTimerRef.current = later(() => setFailed(false), ERROR_MS);
    }
  }, [show, later]);

  // A ref callback, so listeners follow the node itself: they are removed
  // from the old node and added to the new one if it changes, and removed
  // when it unmounts.
  const bind = useCallback(
    (node) => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      nodeRef.current = node;
      if (!node) return;

      // null when no pull is under way
      let pull = null;

      const onStart = (e) => {
        // A second finger landing mid-pull ends it; put the content back
        if (pull?.active) show(0, { animate: true });
        pull = null;
        // Below zero, iOS is still bouncing back from a fling into the top
        if (refreshingRef.current || e.touches.length !== 1 || node.scrollTop !== 0) return;
        const touch = e.touches[0];
        pull = { x: touch.clientX, y: touch.clientY, active: false, crossed: false, distance: 0 };
      };

      const onMove = (e) => {
        if (!pull) return;
        const touch = e.touches[0];
        const dx = touch.clientX - pull.x;
        const dy = touch.clientY - pull.y;
        if (!pull.active) {
          if (Math.abs(dx) < DIRECTION_SLOP && Math.abs(dy) < DIRECTION_SLOP) {
            // Hold iOS's own scroll back while we wait to see the direction.
            // Once it starts, its touchmoves can't be cancelled any more and
            // its rubber band would run on top of ours.
            if (dy > 0 && dy >= Math.abs(dx) && e.cancelable) e.preventDefault();
            return;
          }
          // Only a mostly-vertical drag downward is ours; anything else
          // (a horizontal carousel, a scroll up) is left to the page
          if (dy <= 0 || Math.abs(dx) > dy) {
            pull = null;
            return;
          }
          pull.active = true;
        }
        if (e.cancelable) e.preventDefault();
        pull.distance = pullDistance(dy);
        show(pull.distance);
        if (!pull.crossed && pull.distance >= PULL_THRESHOLD) {
          pull.crossed = true;
          tap();
        }
      };

      const onEnd = () => {
        const current = pull;
        pull = null;
        if (!current || !current.active) return;
        if (current.distance >= PULL_THRESHOLD) runRefresh();
        else show(0, { animate: true });
      };

      const onCancel = () => {
        const current = pull;
        pull = null;
        if (current && current.active) show(0, { animate: true });
      };

      node.addEventListener('touchstart', onStart, { passive: true });
      // Not passive: a pull has to stop the page scrolling under the finger
      node.addEventListener('touchmove', onMove, { passive: false });
      node.addEventListener('touchend', onEnd);
      node.addEventListener('touchcancel', onCancel);
      cleanupRef.current = () => {
        node.removeEventListener('touchstart', onStart);
        node.removeEventListener('touchmove', onMove);
        node.removeEventListener('touchend', onEnd);
        node.removeEventListener('touchcancel', onCancel);
        // Don't leave the old node shifted down
        node.style.transition = '';
        node.style.transform = '';
      };
    },
    [show, runRefresh],
  );

  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const indicator = (
    <PullIndicator ringRef={ringRef} arcRef={arcRef} refreshing={refreshing} failed={failed} spin={!prefersReducedMotion()} messageTop={messageTop} />
  );

  return { bind, indicator };
}
