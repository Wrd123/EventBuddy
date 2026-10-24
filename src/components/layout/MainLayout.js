import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';

// Import all screens
import Home from '../screens/Home';
import EventDetails from '../screens/EventDetails';
import CreateEvent from '../screens/CreateEvent';
import Expenses from '../screens/Expenses';
import Schedule from '../screens/Schedule';
import GroupChat from '../screens/GroupChat';
import Discover from '../screens/Discover';
import Groups from '../screens/Groups';
import Login from '../screens/Login';
import Register from '../screens/Register';
import Profile from '../screens/Profile';
import NotFound from '../screens/NotFound';
import Invite from '../screens/Invite';
import { ScreenLoader } from '../common';

// The map brings in Leaflet, so it loads only when the Map tab is opened
const Map = lazy(() => import('../screens/Map'));

// Every screen has a URL, so refresh, the back button and deep links work.
// Each screen renders its own Footer when it needs one.
const MainLayout = () => (
  <div className="w-full h-full max-w-md mx-auto bg-night overflow-hidden relative">
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/" element={<Home />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/map" element={<Suspense fallback={<ScreenLoader />}><Map /></Suspense>} />
        <Route path="/create" element={<CreateEvent />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/events/:eventId" element={<EventDetails />} />
        <Route path="/events/:eventId/schedule" element={<Schedule />} />
        <Route path="/events/:eventId/chat" element={<GroupChat />} />
        <Route path="/events/:eventId/expenses" element={<Expenses />} />
        <Route path="/invite/:code" element={<Invite />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  </div>
);

// Logged-out users are sent to /login, remembering where they were going
// so they land there after logging in. Not after tapping Log Out, though:
// the next person to log in should start at Home, not on the old Profile.
const RequireAuth = () => {
  const { isAuthenticated, isLoading, loggedOutByUser } = useAppContext();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={loggedOutByUser ? undefined : { from: location }} />;
  }
  return <Outlet />;
};

// Login and Register are only for logged-out users. Once login succeeds this
// redirect is what moves the user on, so the screens don't navigate themselves.
const PublicOnly = () => {
  const { isAuthenticated, isLoading } = useAppContext();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated) {
    return <Navigate to={location.state?.from?.pathname ?? '/'} replace />;
  }
  return <Outlet />;
};

// Loading screen component
const LoadingScreen = () => (
  <div className="w-full h-full bg-night flex items-center justify-center">
    <div className="text-center">
      <div className="animate-pulse text-3xl text-violet-soft font-bold mb-4">
        EventBuddy
      </div>
      <div className="w-12 h-12 border-4 border-violet border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p className="mt-4 text-muted">Loading...</p>
    </div>
  </div>
);

export default MainLayout;
