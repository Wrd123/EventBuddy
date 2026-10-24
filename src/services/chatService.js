// Group chats: one per event, for its members
import { apiRequest } from './api';

const messagesPath = (eventId) => `/events/${encodeURIComponent(eventId)}/messages`;

// The Groups tab: [{ eventId, name, type, startDate, endDate, memberCount,
// lastMessage: { _id, text, sender: { user, name }, createdAt } | null, unread }]
export const getChats = async () => (await apiRequest('/chats')).chats;

// -> { messages (oldest first), hasMore }. after: only newer than this message
// id (for polling). before: the page of history just older than it.
export const getMessages = (eventId, { after, before } = {}) => {
  const params = new URLSearchParams();
  if (after) params.set('after', after);
  if (before) params.set('before', before);
  const query = params.toString();
  return apiRequest(`${messagesPath(eventId)}${query ? `?${query}` : ''}`);
};

export const sendMessage = async (eventId, text) =>
  (await apiRequest(messagesPath(eventId), { method: 'POST', body: { text } })).message;

// Everything up to and including this message counts as read
export const markChatRead = (eventId, lastRead) =>
  apiRequest(`${messagesPath(eventId)}/read`, { method: 'PUT', body: { lastRead } });
