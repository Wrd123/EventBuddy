// An id for one thing the app asks the server to create (a message, a
// payment). Retrying sends the same id again, so the server can tell a retry
// from a new request and never saves the same thing twice.
export const newClientId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Older WebViews: unique enough for one person's own sends
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

// Whether a failed request might still have been saved: the server was
// unreachable or timed out (status 0), or broke partway through (5xx). Only
// then is retrying with the same id the right thing. A 4xx is a definite
// no, so trying again is a new request.
export const mightHaveSaved = (error) => error?.status === 0 || error?.status >= 500;
