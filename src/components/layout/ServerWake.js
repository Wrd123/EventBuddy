import React, { useEffect, useState } from 'react';
import { checkHealth } from '../../services/authService';

// The hosted demo's API runs on a free plan that sleeps after 15 idle
// minutes and takes up to a minute to start again. Rather than letting the
// first screens fail or hang, wait here until the server answers. The
// screen only appears if that takes a moment, so an awake server (or local
// development) goes straight to the app.
//
// Only the hosted web build turns this on (REACT_APP_WAKE_SCREEN=true): a
// real deployment, or the phone app, should open from its saved session
// even when offline.
const ENABLED = process.env.REACT_APP_WAKE_SCREEN === 'true';
const SLOW_AFTER_S = 90;
const README_URL = 'https://github.com/Wrd123/EventBuddy#readme';

const ServerWake = ({ children, enabled = ENABLED, showAfterMs = 1500, retryMs = 2000 }) => {
  const [ready, setReady] = useState(!enabled);
  const [showing, setShowing] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (ready) return undefined;
    let cancelled = false;
    let retry;
    const started = Date.now();

    const show = setTimeout(() => !cancelled && setShowing(true), showAfterMs);
    const tick = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);

    // Each check waits up to the API client's timeout; a waking server
    // usually holds the request until it's up
    const check = async () => {
      try {
        await checkHealth();
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) retry = setTimeout(check, retryMs);
      }
    };
    check();

    return () => {
      cancelled = true;
      clearTimeout(show);
      clearTimeout(retry);
      clearInterval(tick);
    };
  }, [ready, showAfterMs, retryMs]);

  if (ready) return children;
  if (!showing) return <div className="h-full bg-night" />;

  return (
    <div className="flex h-full flex-col items-center justify-center bg-night px-8 text-center" role="status">
      <img src="/favicon.svg" alt="" className="w-20 h-20 mb-6 animate-pulse" />
      <h1 className="text-2xl font-extrabold tracking-tight mb-2">Waking up the demo</h1>
      <p className="text-muted mb-6">
        EventBuddy's demo runs on a free server that sleeps when no one's using it.
        Starting it again usually takes under a minute.
      </p>
      {/* There's no telling how far along the server is, so the bar only
          shows that it's still working rather than inventing progress */}
      <div className="w-full max-w-[14rem] h-1.5 rounded-full bg-surface overflow-hidden mb-2" aria-hidden="true">
        <div className="wake-bar h-full w-1/3 rounded-full bg-accent" />
      </div>
      <p className="text-sm text-faint">
        {seconds < SLOW_AFTER_S
          ? `${seconds} second${seconds === 1 ? '' : 's'}`
          : 'Taking longer than usual. The app opens as soon as the server is up.'}
      </p>
      {seconds >= SLOW_AFTER_S && (
        <a href={README_URL} target="_blank" rel="noopener noreferrer" className="mt-4 text-sm font-semibold text-accent-soft underline underline-offset-4">
          Read about EventBuddy while you wait
        </a>
      )}
    </div>
  );
};

export default ServerWake;
