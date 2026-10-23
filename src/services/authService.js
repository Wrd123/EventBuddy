// Authentication against the EventBuddy API. The login token and a copy of
// the user are kept in localStorage so the app opens logged in.
import { apiRequest, TOKEN_KEY } from './api';

const USER_KEY = 'eventbuddy_user';

const saveSession = ({ token, user }) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

const saveUser = (user) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const login = async (credentials) => {
  const data = await apiRequest('/auth/login', { method: 'POST', body: credentials });
  saveSession(data);
  return data;
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
  const { user } = await apiRequest('/auth/me');
  saveUser(user);
  return user;
};

export const updateProfile = async (profileData) => {
  const data = await apiRequest('/auth/me', { method: 'PATCH', body: profileData });
  saveUser(data.user);
  return data;
};

export const isAuthenticated = () => !!localStorage.getItem(TOKEN_KEY);
