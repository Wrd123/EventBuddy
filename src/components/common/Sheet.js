import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { tap } from '../../services/haptics';

// The one bottom sheet every dialog in the app uses: a labelled modal with
// a scrim, focus handling, an exit animation and drag-to-dismiss.

// Where sheets render. MainLayout provides it so a sheet paints above the
// whole routes container (Leaflet's panes included) and can switch the
// screen underneath off. With no provider (a screen rendered on its own in
// a test) a sheet simply renders in place.
const SheetHostContext = createContext(null);

export const SheetHostProvider = ({ children }) => {
  const contentRef = useRef(null);
  const lockCount = useRef(0);
  // State, not a ref, so sheets re-render once the host node exists
  const [node, setNode] = useState(null);

  // Counted, so a sheet opened over another one doesn't turn the screen
  // back on when it closes. React 18 has no `inert` prop, so it's set
  // on the element directly.
  const lockBackground = useCallback(() => {
    lockCount.current += 1;
    if (contentRef.current) contentRef.current.inert = true;
    return () => {
      lockCount.current -= 1;
      if (lockCount.current === 0 && contentRef.current) contentRef.current.inert = false;
    };
  }, []);

  const getContent = useCallback(() => contentRef.current, []);

  return (
    <SheetHostContext.Provider value={{ node, lockBackground, getContent }}>
      {/* isolate keeps Leaflet's z-index 400-1000 panes inside this box,
          so the host below always paints above the map */}
      <div ref={contentRef} className="relative h-full isolate">{children}</div>
      {/* Clicks fall through to the screen except on a sheet itself */}
      <div ref={setNode} className="absolute inset-0 z-40 pointer-events-none" />
    </SheetHostContext.Provider>
  );
};

const SheetContext = createContext({ close: () => {}, titleId: undefined });

// For content inside a sheet: close it with the exit animation, or label
// something by the sheet's title.
export const useSheet = () => useContext(SheetContext);

// jsdom has no matchMedia; treating that as "reduced motion" makes closes
// happen at once in tests instead of waiting on an animationend that never
// fires. Real browsers always have it.
const prefersReducedMotion = () =>
  typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// If animationend never arrives (a hidden tab, say), close anyway
const EXIT_FALLBACK_MS = 450;
// Past this share of the sheet's height, or this speed, a drag dismisses
const DISMISS_FRACTION = 0.3;
const DISMISS_SPEED = 0.6; // px per ms
// Dragging up fights back instead of lifting the sheet off its edge
const UP_RESISTANCE = 0.2;
const SNAP_BACK_MS = 200;
// A flick has to travel at least this far to dismiss. A jittery tap can
// register a couple of pixels in a few milliseconds, which is "fast" but
// isn't a drag.
const MIN_FLICK_TRAVEL = 16;
// A pause before letting go means the finger had stopped; ignore old speed
const STALE_SPEED_MS = 100;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open sheets, newest last, so Escape only closes the top one
const openSheets = [];

const Sheet = ({
  title, lead, subtitle, header, onClose, className = '', as: Panel = 'div', onSubmit, initialFocus, children
}) => {
  const titleId = useId();
  const host = useContext(SheetHostContext);
  const panelRef = useRef(null);
  const scrimRef = useRef(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const drag = useRef(null);
  const lockBackground = host?.lockBackground;
  const getContent = host?.getContent;

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (prefersReducedMotion()) {
      onCloseRef.current();
      return;
    }
    setClosing(true);
  }, []);

  // The exit animation's end calls onClose; the timer covers it not firing
  useEffect(() => {
    if (!closing) return undefined;
    const timer = setTimeout(() => onCloseRef.current(), EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  const finishExit = (e) => {
    if (closing && e.target === e.currentTarget) onCloseRef.current();
  };

  // Focus in on open and back on close; the screen underneath goes inert
  useEffect(() => {
    const previous = document.activeElement;
    const unlock = lockBackground?.();
    const entry = {};
    openSheets.push(entry);
    // The panel itself by default: screen readers announce the title, and
    // iOS doesn't pop the keyboard for a form's first field
    (initialFocus?.current ?? panelRef.current)?.focus({ preventScroll: true });

    const onKeyDown = (e) => {
      if (openSheets[openSheets.length - 1] !== entry) return;
      const panel = panelRef.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active) || (e.shiftKey && (active === first || active === panel))) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openSheets.splice(openSheets.indexOf(entry), 1);
      // Unlock first: an inert element can't take focus back
      unlock?.();
      if (previous && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      } else {
        // The control that opened the sheet is gone (the list it was in
        // changed). Land on the screen's title rather than the page body, so
        // keyboard and screen reader users keep their place.
        const content = getContent?.();
        const target = content?.querySelector('h1') || content?.querySelector('main');
        if (target) {
          if (!target.matches(FOCUSABLE)) target.tabIndex = -1;
          target.focus({ preventScroll: true });
        }
      }
    };
  }, [lockBackground, getContent, initialFocus, close]);

  const onDragDismiss = () => tap();

  const setDragOffset = (offset, height) => {
    const panel = panelRef.current;
    panel.style.transform = `translateY(${offset}px)`;
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, 1 - Math.max(0, offset) / height));
  };

  const startDrag = (e) => {
    if (closingRef.current || (e.pointerType === 'mouse' && e.button > 0)) return;
    // The close button and any links in a custom header stay clickable
    if (e.target.closest('button, a, input, select, textarea')) return;
    const panel = panelRef.current;
    panel.style.transition = 'none';
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, speed: 0, offset: 0,
      height: panel.offsetHeight || panel.getBoundingClientRect().height || 1
    };
  };

  const moveDrag = (e) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    d.offset = dy > 0 ? dy : dy * UP_RESISTANCE;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.speed = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setDragOffset(d.offset, d.height);
  };

  const endDrag = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const speed = e.timeStamp - d.lastT > STALE_SPEED_MS ? 0 : d.speed;
    // A cancelled gesture (the system took the touch) never dismisses
    if (e.type !== 'pointercancel' && (d.offset > d.height * DISMISS_FRACTION || (speed > DISMISS_SPEED && d.offset > MIN_FLICK_TRAVEL))) {
      onDragDismiss();
      close();
      return;
    }
    panelRef.current.style.transition = `transform ${SNAP_BACK_MS}ms ease-out`;
    panelRef.current.style.transform = '';
    if (scrimRef.current) {
      scrimRef.current.style.transition = `opacity ${SNAP_BACK_MS}ms ease-out`;
      scrimRef.current.style.opacity = '';
    }
  };

  const dragHandlers = {
    onPointerDown: startDrag,
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag
  };

  const sheet = (
    <SheetContext.Provider value={{ close, titleId }}>
      <div
        ref={scrimRef}
        className={`absolute inset-0 flex flex-col justify-end sheet-scrim pointer-events-auto${closing ? ' sheet-scrim-closing' : ''}${host ? '' : ' z-40'}`}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        <Panel
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onSubmit={onSubmit}
          onAnimationEnd={finishExit}
          className={`sheet focus:outline-none${closing ? ' sheet-closing' : ''} ${className}`}
        >
          {/* Only the handle and header drag, so the body still scrolls */}
          <div className="touch-none" {...dragHandlers}>
            {header ? header({ titleId, close }) : (
              <>
                <div className="mx-auto -mt-1 mb-2 h-1 w-9 rounded-full bg-line" aria-hidden="true" />
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {lead}
                    <div className="min-w-0">
                      <h2 id={titleId} className="text-lg font-semibold truncate">{title}</h2>
                      {subtitle}
                    </div>
                  </div>
                  <button type="button" onClick={close} className="w-11 h-11 -mr-2 -my-2 shrink-0 flex items-center justify-center text-faint" aria-label="Close">
                    <X size={20} />
                  </button>
                </div>
              </>
            )}
          </div>
          {children}
        </Panel>
      </div>
    </SheetContext.Provider>
  );

  if (!host) return sheet;
  return host.node ? createPortal(sheet, host.node) : null;
};

export default Sheet;
