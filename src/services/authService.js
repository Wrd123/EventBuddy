// Authentication against the EventBuddy API. The login token and a copy of
// the user are kept in localStorage so the app opens logged in.
import { apiRequest, TOKEN_KEY } from './api';
import { todayISO } from '../utils/dates';

const USER_KEY = 'eventbuddy_user';

const saveSession = ({ token, user }) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

// Only while the login the request was sent with is still the current one,
// so an answer that lands after logging out can't put the old user back
const saveUserFor = (token, user) => {
  if (localStorage.getItem(TOKEN_KEY) === token) localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const login = async (credentials) => {
  const data = await apiRequest('/auth/login', { method: 'POST', body: credentials });
  saveSession(data);
  return data;
};

// One-tap sign-in as the demo user (only when the server runs in demo mode)
// A private copy of the demo, with today's picnic on this phone's today
export const loginDemo = async () => {
  const data = await apiRequest('/auth/demo', { method: 'POST', body: { today: todayISO() } });
  saveSession(data);
  return data;
};

// { status: 'ok', demo }. Throws if the server can't be reached.
export const checkHealth = () => apiRequest('/health');

// Whether the server offers the demo sign-in. False if it can't be reached.
export const isDemoAvailable = async () => {
  try {
    return Boolean((await checkHealth()).demo);
  } catch {
    return false;
  }
};

export const register = async (userData) => {
  const data = await apiRequest('/auth/register', { method: 'POST', body: userData });
  saveSession(data);
  return data;
};

export const logout = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

// Ends this login on the server, so the token stops working everywhere,
// not just on this phone. Call before logout(), which forgets the token.
// A 401 means it had ended already, which is what we wanted. Anything else
// (offline, say) is thrown, so the person hears it didn't reach the server.
export const endSession = async () => {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } catch (err) {
    if (err.status !== 401) throw err;
  }
};

// { currentPassword, newPassword }. Every other login ends; the server sends
// a new token for this one, kept only if this is still the login it was for.
export const changePassword = async (passwords) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const data = await apiRequest('/auth/password', { method: 'POST', body: passwords, replacesToken: true });
  if (localStorage.getItem(TOKEN_KEY) === token) saveSession(data);
  return data;
};

// The cached user, for an instant start before the server answers.
// Without a token the cached user is meaningless.
export const getCurrentUser = () => {
  if (!localStorage.getItem(TOKEN_KEY)) return null;
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
};

// Fresh user from the server; also checks the token is still valid
export const getProfile = async () => {
  const token = localStorage.getItem(TOKEN_KEY);
  const { user } = await apiRequest('/auth/me');
  saveUserFor(token, user);
  return user;
};

export const updateProfile = async (profileData) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const data = await apiRequest('/auth/me', { method: 'PATCH', body: profileData });
  saveUserFor(token, data.user);
  return data;
};

export const isAuthenticated = () => !!localStorage.getItem(TOKEN_KEY);
