// Events from the EventBuddy API
import { apiRequest } from './api';

const eventPath = (eventId) => `/events/${encodeURIComponent(eventId)}`;

export const getUserEvents = async () => {
  const { events } = await apiRequest('/events');
  return events;
};

export const getEventById = async (eventId) => {
  const { event } = await apiRequest(eventPath(eventId));
  return event;
};

// Returns { event }. The server adds the logged-in user as organizer and
// first member, and validates the fields.
export const createEvent = (eventData) =>
  apiRequest('/events', { method: 'POST', body: eventData });

export const updateEvent = (eventId, eventData) =>
  apiRequest(eventPath(eventId), { method: 'PATCH', body: eventData });

export const deleteEvent = (eventId) =>
  apiRequest(eventPath(eventId), { method: 'DELETE' });

// Leave an event (your own id), or, as organizer, remove someone. A 409
// explains why not yet, e.g. a balance that isn't settled.
export const removeMember = (eventId, userId) =>
  apiRequest(`${eventPath(eventId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });

// Organizer only: people they removed, [{ user, name }], and letting one back in
export const getRemoved = async (eventId) => (await apiRequest(`${eventPath(eventId)}/removed`)).removed;

export const letBackIn = (eventId, userId) =>
  apiRequest(`${eventPath(eventId)}/removed/${encodeURIComponent(userId)}`, { method: 'DELETE' });

// What's been happening in the event -> { activity (newest first), hasMore }.
// before: the page just older than this line's id.
export const getActivity = (eventId, { before } = {}) =>
  apiRequest(`${eventPath(eventId)}/activity${before ? `?before=${encodeURIComponent(before)}` : ''}`);

// Schedule items. Each call returns the whole updated event.
const schedulePath = (eventId, itemId) =>
  `${eventPath(eventId)}/schedule${itemId ? `/${encodeURIComponent(itemId)}` : ''}`;

export const addScheduleItem = async (eventId, item) => {
  const { event } = await apiRequest(schedulePath(eventId), { method: 'POST', body: item });
  return event;
};

export const updateScheduleItem = async (eventId, itemId, changes) => {
  const { event } = await apiRequest(schedulePath(eventId, itemId), { method: 'PATCH', body: changes });
  return event;
};

export const deleteScheduleItem = async (eventId, itemId) => {
  const { event } = await apiRequest(schedulePath(eventId, itemId), { method: 'DELETE' });
  return event;
};

// going: true to join, false to leave
export const setGoing = async (eventId, itemId, going) => {
  const { event } = await apiRequest(`${schedulePath(eventId, itemId)}/going`, {
    method: going ? 'PUT' : 'DELETE'
  });
  return event;
};

// Invites. getInvite returns a preview ({ eventId, name, ..., isMember });
// joinInvite and resetInviteLink return the whole event.
const invitePath = (code) => `/invites/${encodeURIComponent(code)}`;

export const getInvite = async (code) => {
  const { invite } = await apiRequest(invitePath(code));
  return invite;
};

export const joinInvite = async (code) => {
  const { event } = await apiRequest(`${invitePath(code)}/join`, { method: 'POST' });
  return event;
};

export const resetInviteLink = async (eventId) => {
  const { event } = await apiRequest(`${eventPath(eventId)}/invite/reset`, { method: 'POST' });
  return event;
};

// Money. getLedger returns { expenses, payments } for an event.
const expensePath = (eventId, expenseId) =>
  `${eventPath(eventId)}/expenses${expenseId ? `/${encodeURIComponent(expenseId)}` : ''}`;
const paymentPath = (eventId, paymentId) =>
  `${eventPath(eventId)}/payments${paymentId ? `/${encodeURIComponent(paymentId)}` : ''}`;

export const getLedger = (eventId) => apiRequest(expensePath(eventId));

// expense: { clientId, description, amountCents, date, paidBy, splitType, shares: [{ user, amountCents }] }.
// Retries reuse the clientId, so a lost response can't add it twice.
export const addExpense = async (eventId, expense) =>
  (await apiRequest(expensePath(eventId), { method: 'POST', body: expense })).expense;

export const updateExpense = async (eventId, expenseId, expense) =>
  (await apiRequest(expensePath(eventId, expenseId), { method: 'PATCH', body: expense })).expense;

export const deleteExpense = (eventId, expenseId) =>
  apiRequest(expensePath(eventId, expenseId), { method: 'DELETE' });

// payment: { clientId, from, to, amountCents, date }. Retries reuse the clientId.
export const recordPayment = async (eventId, payment) =>
  (await apiRequest(paymentPath(eventId), { method: 'POST', body: payment })).payment;

export const deletePayment = (eventId, paymentId) =>
  apiRequest(paymentPath(eventId, paymentId), { method: 'DELETE' });

// Members' payment handles for settling up: [{ user, name, venmo, cashapp, paypal, zelle }]
export const getPaymentHandles = async (eventId) => {
  const { handles } = await apiRequest(`${eventPath(eventId)}/payment-handles`);
  return handles;
};
