import React, { useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const TAB_PATHS = ['/', '/groups', '/discover', '/map', '/profile'];

// Which enter animation a navigation gets. Moving between tabs is a quick
// fade; going deeper slides in from the right and going back from the left,
// like a native stack. A replace (login redirects) and the first render
// don't animate, since nothing was on screen to move away from.
export const transitionClass = (fromPath, toPath, navigationType) => {
  if (fromPath === null || navigationType === 'REPLACE') return '';
  if (TAB_PATHS.includes(fromPath) && TAB_PATHS.includes(toPath)) return 'route-fade';
  if (navigationType === 'POP') return 'route-pop';
  return 'route-push';
};

// Wraps the routes in a div keyed by path, so each screen mounts fresh and
// plays its enter animation. Only an enter animation: an exit would keep
// two screens mounted at once, with their polling and Leaflet maps.
const RouteTransition = ({ children }) => {
  const { pathname, state: locationState } = useLocation();
  // The Header's back button navigates by path, which is a push; it says
  // so in the location state, and it should feel like going back
  const navigationType = useNavigationType();
  const direction = navigationType === 'PUSH' && locationState?.back ? 'POP' : navigationType;
  const [state, setState] = useState({ path: pathname, className: '' });

  // Worked out once per path change and kept in state, so an unrelated
  // re-render can't drop the class and cut the animation short
  let { className } = state;
  if (state.path !== pathname) {
    className = transitionClass(state.path, pathname, direction);
    setState({ path: pathname, className });
  }

  return (
    <div key={pathname} className={`h-full ${className}`.trim()}>
      {children}
    </div>
  );
};

export default RouteTransition;
