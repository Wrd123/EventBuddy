import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import * as authService from '../services/authService';
import * as eventService from '../services/eventService';
import { findDevicePlace, deviceHasLocation, NO_LOCATION_SUPPORT } from '../services/devicePlace';
import { setUnauthorizedHandler } from '../services/api';
import { SharingProvider } from './SharingContext';
import { usePolling } from '../hooks/usePolling';
import { createFreshness } from '../utils/freshness';
import { isGoing, withAttendance } from '../utils/schedule';
import { warning } from '../services/haptics';

// While the app is open, your events are checked this often for changes
// friends made (a new schedule item, someone joining, an event deleted)
export const EVENTS_POLL_MS = 30000;

// Create context
const AppContext = createContext();

// Where Discover and Home search for local events, remembered on this
// device. Storage can be unavailable (e.g. private browsing).
const PLACE_KEY = 'eventbuddy_place';

const readStoredPlace = () => {
  try {
    return JSON.parse(localStorage.getItem(PLACE_KEY)) || null;
  } catch {
    return null;
  }
};

const writeStoredPlace = (place) => {
  try {
    if (place) localStorage.setItem(PLACE_KEY, JSON.stringify(place));
    else localStorage.removeItem(PLACE_KEY);
  } catch {
    // Not remembered, but it still works for this visit
  }
};

// Context provider component: auth and event data. Navigation lives in the
// router (see MainLayout), so nothing here changes screens.
export const AppProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [place, setPlace] = useState(readStoredPlace);
  // Why the phone's location isn't available, or '' (see the effect below).
  // Without location support at all, there's nothing to ask.
  const [deviceError, setDeviceError] = useState('');
  const locationError = deviceHasLocation() ? deviceError : NO_LOCATION_SUPPORT;
  const locatedThisLaunch = useRef(false);
  const placeRef = useRef(place);
  placeRef.current = place;
  const [eventsStatus, setEventsStatus] = useState('loading');
  // True after the user taps Log out (vs. a session that expired), so the
  // login guard doesn't send the next login back to the page they left
  const [loggedOutByUser, setLoggedOutByUser] = useState(false);

  // Events are read again and again to stay fresh. This keeps a slow read
  // from undoing something newer (see utils/freshness.js).
  const [freshness] = useState(createFreshness);
  // Every change made here goes through this, so reads that started
  // before it can't undo it
  const changeEvents = useCallback((update) => {
    freshness.changed();
    setEvents(update);
  }, [freshness]);

  // Which login this is. It changes on every login and logout, so an answer
  // to a change made before then (creating an event, say) can tell it
  // arrived too late and leave the list alone. Reads have freshness instead.
  const session = useRef(0);
  // Call before sending a change; the function it returns applies the
  // change to your events only if the same person is still logged in
  const changeForThisSession = useCallback(() => {
    const askedIn = session.current;
    return (update) => {
      if (session.current !== askedIn) return false;
      changeEvents(update);
      return true;
    };
  }, [changeEvents]);

  // Going taps the server hasn't confirmed yet, by "eventId:itemId", as
  // { wanted, confirmed, promise } (see setGoing below). A read that started
  // after the tap but reached the server before it is accepted as fresh, yet
  // doesn't have the tap, so every copy that comes in gets these laid over it.
  const goingState = useRef({});
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const withPendingGoing = useCallback((event) => {
    const me = currentUserRef.current;
    const prefix = `${event._id}:`;
    const wanted = {};
    Object.entries(goingState.current).forEach(([key, state]) => {
      if (key.startsWith(prefix)) wanted[key.slice(prefix.length)] = state.wanted;
    });
    if (!me || Object.keys(wanted).length === 0) return event;
    return {
      ...event,
      schedule: event.schedule.map(item => (item._id in wanted ? withAttendance(item, me, wanted[item._id]) : item))
    };
  }, []);

  // Drop the session locally (no navigation; the router's guards react to it).
  // Stable identity, since the effects below depend on it.
  const clearSession = useCallback(() => {
    authService.logout();
    // Reads and changes still on their way belong to the old session
    session.current += 1;
    freshness.changed();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setEvents([]);
    goingState.current = {};
    // Someone else may use this device next
    setPlace(null);
    writeStoredPlace(null);
    setDeviceError('');
    locatedThisLaunch.current = false;
  }, [freshness]);

  const savePlace = useCallback((next) => {
    setPlace(next);
    writeStoredPlace(next);
  }, []);

  // If the server rejects our token mid-session (expired), log out
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(() => {});
  }, [clearSession]);

  // Initialize authentication state
  useEffect(() => {
    const initAuth = async () => {
      // Start from the cached user so the app opens instantly
      const user = authService.getCurrentUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      setCurrentUser(user);
      setIsAuthenticated(true);
      setIsLoading(false);

      try {
        // Refresh from the server, which also confirms the token is valid
        setCurrentUser(await authService.getProfile());
      } catch (error) {
        // Only an explicit rejection ends the session. Offline or a server
        // hiccup keeps the cached user, as phone apps do.
        if (error.status === 401) clearSession();
      }
    };

    initAuth();
  }, [clearSession]);
  
  // Reads your events and applies them if they're still current.
  // -> true when applied (false: something newer won, so they were dropped)
  const readEvents = useCallback(async () => {
    const read = freshness.start();
    const list = await eventService.getUserEvents();
    if (!freshness.accept(read)) return false;
    setEvents(list.map(withPendingGoing));
    setEventsStatus('ready');
    return true;
  }, [freshness, withPendingGoing]);

  // Your events, loaded after login. eventsStatus lets Home tell "still
  // loading" and "couldn't load" apart from "no events yet".
  const loadEvents = useCallback(async () => {
    setEventsStatus('loading');
    try {
      // A first load overtaken by a change is read again, so the screen
      // doesn't wait on the next poll. If every try is overtaken, it stays
      // loading and the next background refresh finishes it.
      for (let tries = 0; tries < 3 && !(await readEvents()); tries += 1);
    } catch (error) {
      setEventsStatus('error');
    }
  }, [readEvents]);

  useEffect(() => {
    if (isAuthenticated) loadEvents();
  }, [isAuthenticated, loadEvents]);

  // Background refreshes stay quiet: no loading state, and a failure just
  // waits for the next one
  const authenticatedRef = useRef(isAuthenticated);
  authenticatedRef.current = isAuthenticated;
  usePolling(() => {
    if (authenticatedRef.current) readEvents().catch(() => {});
  }, EVENTS_POLL_MS);

  // One event, fresh from the server, for a screen showing it.
  // -> { status: 'ready' | 'not-found' | 'error', error } or null when the
  // answer was overtaken by something newer
  const fetchEvent = useCallback(async (eventId) => {
    const read = freshness.start();
    try {
      const event = withPendingGoing(await eventService.getEventById(eventId));
      if (!freshness.accept(read)) return null;
      setEvents(prev =>
        prev.some(e => e._id === event._id) ? prev.map(e => (e._id === event._id ? event : e)) : [...prev, event]
      );
      return { status: 'ready', error: '' };
    } catch (err) {
      if (!freshness.accept(read)) return null;
      // 404: deleted, or you're not in it anymore, so it leaves your list.
      // Anything else (offline, server waking up) keeps what we have.
      if (err.status === 404) {
        setEvents(prev => prev.filter(e => e._id !== eventId));
        return { status: 'not-found', error: err.message };
      }
      return { status: 'error', error: err.message };
    }
  }, [freshness, withPendingGoing]);

  // Home and Discover look for events around the phone, without asking
  // anyone to choose a place. Once per launch (or login) ask the phone where
  // it is, so suggestions follow people when they travel. A city they typed
  // stays until they pick their location again. If the phone can't say
  // (permission denied, no signal), the last place stays; with none, the
  // screens explain why and offer a city search.
  useEffect(() => {
    if (!isAuthenticated || locatedThisLaunch.current || placeRef.current?.source === 'search') return;
    if (!deviceHasLocation()) return;
    locatedThisLaunch.current = true;
    findDevicePlace().then(
      (found) => {
        // Not if they logged out, or typed a city, while the phone was answering
        if (!locatedThisLaunch.current || placeRef.current?.source === 'search') return;
        savePlace(found);
        setDeviceError('');
      },
      (err) => setDeviceError(err.message)
    );
  }, [isAuthenticated, savePlace]);

  // Authentication. Errors are thrown for the screen to show.
  const startSession = (response) => {
    // Nothing read or changed before this login belongs to it
    session.current += 1;
    freshness.changed();
    setCurrentUser(response.user);
    setIsAuthenticated(true);
    setLoggedOutByUser(false);
    return response;
  };

  const login = async (credentials) => startSession(await authService.login(credentials));

  const loginDemo = async () => startSession(await authService.loginDemo());

  const register = async (userData) => startSession(await authService.register(userData));

  // Ending any location share comes first, in Profile (useLogOut), since
  // it needs the login token this clears
  const logout = () => {
    clearSession();
    setLoggedOutByUser(true);
  };

  const updateProfile = async (profileData) => {
    const askedIn = session.current;
    const response = await authService.updateProfile(profileData);
    if (session.current === askedIn) setCurrentUser(response.user);
    return response;
  };

  // Event changes; the caller decides where to go next
  const createNewEvent = async (eventData) => {
    const apply = changeForThisSession();
    const response = await eventService.createEvent(eventData);
    apply(prev => [...prev, response.event]);
    return response;
  };

  const updateEventData = async (eventId, eventData) => {
    const apply = changeForThisSession();
    const response = await eventService.updateEvent(eventId, eventData);
    apply(prev => prev.map(event => (event._id === eventId ? response.event : event)));
    return response;
  };

  const deleteEventData = async (eventId) => {
    const apply = changeForThisSession();
    await eventService.deleteEvent(eventId);
    apply(prev => prev.filter(event => event._id !== eventId));
  };

  // Replace an event in the list with a fresh copy from the server, or add it
  // if the list doesn't have it yet (e.g. it was opened from a link). apply
  // comes from changeForThisSession, taken before the request went out.
  const storeEvent = (apply, updated) => {
    const shown = withPendingGoing(updated);
    apply(prev =>
      prev.some(event => event._id === updated._id)
        ? prev.map(event => (event._id === updated._id ? shown : event))
        : [...prev, shown]
    );
    return updated;
  };

  // Leaving takes the event off your list. Errors (like a balance that
  // isn't settled) are thrown for the screen to show.
  const leaveEvent = async (eventId) => {
    const apply = changeForThisSession();
    await eventService.removeMember(eventId, currentUser._id);
    apply(prev => prev.filter(event => event._id !== eventId));
  };

  const removeMember = async (eventId, userId) => {
    const apply = changeForThisSession();
    await eventService.removeMember(eventId, userId);
    apply(prev => prev.map(event => (
      event._id === eventId ? { ...event, members: event.members.filter(m => m.user !== userId) } : event
    )));
  };

  // Schedule actions. Errors are thrown for the screen to show next to the
  // form or button.
  const addScheduleItem = async (eventId, item) => {
    const apply = changeForThisSession();
    return storeEvent(apply, await eventService.addScheduleItem(eventId, item));
  };

  const updateScheduleItem = async (eventId, itemId, changes) => {
    const apply = changeForThisSession();
    return storeEvent(apply, await eventService.updateScheduleItem(eventId, itemId, changes));
  };

  const deleteScheduleItem = async (eventId, itemId) => {
    const apply = changeForThisSession();
    return storeEvent(apply, await eventService.deleteScheduleItem(eventId, itemId));
  };

  // Going shows at once and the server catches up. Taps can come faster than
  // answers, and the server may apply two requests in either order, so each
  // item gets at most one request in flight. Taps meanwhile only change what
  // is wanted; when the request in flight lands, another goes out if what is
  // wanted has changed, so the last request always carries the last state
  // tapped. My own entry always comes from that queue, never from the copy
  // on screen, since a read may have replaced the copy meanwhile; an answer
  // only brings friends' attendance for that one item.
  const eventsRef = useRef(events);
  eventsRef.current = events;

  // Sets that item's attendees from fresh ones (or its own), with me as given
  const withMyAttendance = (eventId, itemId, going, fresh) => (prev) =>
    prev.map(event => event._id !== eventId ? event : {
      ...event,
      schedule: event.schedule.map(item =>
        item._id !== itemId ? item : withAttendance({ ...item, attendees: (fresh ?? item).attendees }, currentUser, going)
      )
    });

  const findItem = (list, eventId, itemId) =>
    list.find(e => e._id === eventId)?.schedule.find(i => i._id === itemId);

  const setGoing = (eventId, itemId, going) => {
    const key = `${eventId}:${itemId}`;
    let state = goingState.current[key];
    if (!state) {
      const item = findItem(eventsRef.current, eventId, itemId);
      state = { wanted: going, confirmed: item ? isGoing(item, currentUser._id) : !going, promise: null };
      goingState.current[key] = state;
    }
    state.wanted = going;
    changeEvents(withMyAttendance(eventId, itemId, going));
    if (state.promise) return state.promise;

    const run = async () => {
      // A logout clears the queue; whatever lands after it is dropped
      const askedIn = session.current;
      const stillHere = () => session.current === askedIn;
      let sent;
      try {
        while (stillHere() && sent !== state.wanted) {
          sent = state.wanted;
          // The answer is also a read of who else is going, as of when it
          // was sent, so it follows the same freshness rule as any read
          const read = freshness.start();
          const updated = await eventService.setGoing(eventId, itemId, sent);
          if (!stillHere()) return;
          state.confirmed = sent;
          // Friends' attendance from the answer unless a newer read already
          // landed; mine is what's wanted now either way
          const fresh = freshness.accept(read) ? findItem([updated], eventId, itemId) : null;
          setEvents(withMyAttendance(eventId, itemId, state.wanted, fresh));
        }
      } catch (err) {
        // Back to what the server last confirmed. The queue goes first, so
        // the check with the server below isn't laid over with the failed tap.
        if (goingState.current[key] === state) delete goingState.current[key];
        if (!stillHere()) throw err;
        changeEvents(withMyAttendance(eventId, itemId, state.confirmed));
        fetchEvent(eventId).catch(() => {});
        warning();
        throw err;
      } finally {
        // Unless a logout already cleared it, or a new tap started afresh
        if (goingState.current[key] === state) delete goingState.current[key];
      }
    };
    state.promise = run();
    return state.promise;
  };

  // Invites: joining adds the event to your list right away
  const joinEvent = async (inviteCode) => {
    const apply = changeForThisSession();
    return storeEvent(apply, await eventService.joinInvite(inviteCode));
  };

  const resetInviteLink = async (eventId) => {
    const apply = changeForThisSession();
    return storeEvent(apply, await eventService.resetInviteLink(eventId));
  };

  // Values to be provided to consumers
  const value = {
    currentUser,
    isAuthenticated,
    isLoading,
    loggedOutByUser,
    events,
    eventsStatus,
    reloadEvents: loadEvents,
    fetchEvent,
    place,
    savePlace,
    locationError,
    login,
    loginDemo,
    register,
    logout,
    updateProfile,
    createEvent: createNewEvent,
    updateEvent: updateEventData,
    deleteEvent: deleteEventData,
    leaveEvent,
    removeMember,
    addScheduleItem,
    updateScheduleItem,
    deleteScheduleItem,
    setGoing,
    joinEvent,
    resetInviteLink
  };

  return (
    <AppContext.Provider value={value}>
      <SharingProvider isAuthenticated={isAuthenticated} isLoading={isLoading}>
        {children}
      </SharingProvider>
    </AppContext.Provider>
  );
};

// Custom hook for using the context
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};