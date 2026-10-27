// Small fetch wrapper for the EventBuddy API.
//
// In development, CRA's "proxy" (package.json) forwards /api to the server on
// port 4000, so the default base URL just works. A native build (Capacitor)
// or a separately hosted API sets REACT_APP_API_URL to the full address.
const API_URL = process.env.REACT_APP_API_URL || '/api';
const TIMEOUT_MS = 15000;

export const TOKEN_KEY = 'eventbuddy_token';

// An error whose message is safe to show the user. status is the HTTP
// status, or 0 when the server couldn't be reached at all.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Called when the server rejects our login token (expired or revoked), so
// the app can drop the session instead of failing every request
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

// A request that replaces the login token (changing your password) ends the
// old token on the server before its answer, with the new one, gets back.
// A background read sent with the old token can be refused in that gap.
// While such a request is out: { token it replaces, settled: whether it
// worked }.
let replacing = null;

// After a 401 for token: whether the session really ended. If it was being
// replaced, waits to hear: a 401 is expected once the change has landed.
const sessionEnded = async (token, isTheReplacement) => {
  if (!isTheReplacement && replacing?.token === token && (await replacing.settled)) return false;
  // Only if it's still the login in use: a request sent before logging in
  // as someone else mustn't end the session that replaced it
  return localStorage.getItem(TOKEN_KEY) === token;
};

// options.replacesToken: this request gets a new login token back (see
// replacing above)
export const apiRequest = (path, options = {}) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!options.replacesToken || !token) return send(path, options, token, false);

  const request = send(path, options, token, true);
  const settled = request.then(() => true, () => false);
  replacing = { token, settled };
  settled.then(() => {
    if (replacing?.settled === settled) replacing = null;
  });
  return request;
};

const send = async (path, { method = 'GET', body }, token, isTheReplacement) => {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
  } catch {
    throw new ApiError(0, "Can't reach EventBuddy. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // Only a token we sent can be "expired"; a 401 from logging in with a
    // wrong password is just a failed login
    if (response.status === 401 && token && (await sessionEnded(token, isTheReplacement))) onUnauthorized();
    throw new ApiError(response.status, data?.message || 'Something went wrong. Please try again.');
  }
  return data;
};
