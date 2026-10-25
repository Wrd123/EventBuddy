import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import * as authService from '../services/authService';
import * as eventService from '../services/eventService';
import { findDevicePlace, deviceHasLocation, NO_LOCATION_SUPPORT } from '../services/devicePlace';
import { setUnauthorizedHandler } from '../services/api';
import { SharingProvider, stopStoredShare } from './SharingContext';
import { usePolling } from '../hooks/usePolling';
import { createFreshness } from '../utils/freshness';

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

  // Drop the session locally (no navigation; the router's guards react to it).
  // Stable identity, since the effects below depend on it.
  const clearSession = useCallback(() => {
    authService.logout();
    // Reads still on their way belong to the old session
    freshness.changed();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setEvents([]);
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
    setEvents(list);
    setEventsStatus('ready');
    return true;
  }, [freshness]);

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
      const event = await eventService.getEventById(eventId);
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
  }, [freshness]);

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
    // Nothing read before this login belongs to it
    freshness.changed();
    setCurrentUser(response.user);
    setIsAuthenticated(true);
    setLoggedOutByUser(false);
    return response;
  };

  const login = async (credentials) => startSession(await authService.login(credentials));

  const loginDemo = async () => startSession(await authService.loginDemo());

  const register = async (userData) => startSession(await authService.register(userData));

  const logout = () => {
    // Friends shouldn't keep seeing where you were; this needs the login
    // token, so it goes before the session is cleared
    stopStoredShare();
    clearSession();
    setLoggedOutByUser(true);
  };

  const updateProfile = async (profileData) => {
    const response = await authService.updateProfile(profileData);
    setCurrentUser(response.user);
    return response;
  };

  // Event changes; the caller decides where to go next
  const createNewEvent = async (eventData) => {
    const response = await eventService.createEvent(eventData);
    changeEvents(prev => [...prev, response.event]);
    return response;
  };

  const updateEventData = async (eventId, eventData) => {
    const response = await eventService.updateEvent(eventId, eventData);
    changeEvents(prev => prev.map(event => (event._id === eventId ? response.event : event)));
    return response;
  };

  const deleteEventData = async (eventId) => {
    await eventService.deleteEvent(eventId);
    changeEvents(prev => prev.filter(event => event._id !== eventId));
  };

  // Replace an event in the list with a fresh copy from the server, or add it
  // if the list doesn't have it yet (e.g. it was opened from a link)
  const storeEvent = (updated) => {
    changeEvents(prev =>
      prev.some(event => event._id === updated._id)
        ? prev.map(event => (event._id === updated._id ? updated : event))
        : [...prev, updated]
    );
    return updated;
  };

  // Schedule actions. Errors are thrown for the screen to show next to the
  // form or button.
  const addScheduleItem = async (eventId, item) =>
    storeEvent(await eventService.addScheduleItem(eventId, item));

  const updateScheduleItem = async (eventId, itemId, changes) =>
    storeEvent(await eventService.updateScheduleItem(eventId, itemId, changes));

  const deleteScheduleItem = async (eventId, itemId) =>
    storeEvent(await eventService.deleteScheduleItem(eventId, itemId));

  const setGoing = async (eventId, itemId, going) =>
    storeEvent(await eventService.setGoing(eventId, itemId, going));

  // Invites: joining adds the event to your list right away
  const joinEvent = async (inviteCode) =>
    storeEvent(await eventService.joinInvite(inviteCode));

  const resetInviteLink = async (eventId) =>
    storeEvent(await eventService.resetInviteLink(eventId));

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