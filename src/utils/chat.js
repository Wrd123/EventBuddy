// Laying out a chat: day dividers, runs of messages from the same person,
// and short times for the Groups list.
import { toISODate } from './dates';

// Messages from one person within this long of each other read as one run:
// their name shows once at the top and their avatar once at the bottom
const RUN_GAP_MS = 5 * 60 * 1000;

const time = (date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// "Today", "Yesterday", "Monday" within the last week, then "Sat, Oct 3"
// (with the year once it isn't this year)
export const dayLabel = (date, now = new Date()) => {
  const day = toISODate(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day === toISODate(now)) return 'Today';
  if (day === toISODate(yesterday)) return 'Yesterday';

  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);
  if (day >= toISODate(weekAgo)) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' })
  });
};

// For the Groups list: "2:34 PM" today, then "Yesterday", "Mon", "Oct 3"
export const shortTime = (createdAt, now = new Date()) => {
  const date = new Date(createdAt);
  const label = dayLabel(date, now);
  if (label === 'Today') return time(date);
  if (label === 'Yesterday') return label;
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);
  if (toISODate(date) >= toISODate(weekAgo)) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' })
  });
};

// Messages (oldest first) -> what the chat draws, in order:
//   { kind: 'day', key, label }
//   { kind: 'message', key, message, mine, first, last, time }
// first: starts a run (show the sender's name). last: ends one (show their
// avatar and the time).
export const layoutChat = (messages, myId, now = new Date()) => {
  const items = [];
  let previous = null;
  let previousDay = null;

  messages.forEach((message, i) => {
    const sentAt = new Date(message.createdAt);
    const day = toISODate(sentAt);
    if (day !== previousDay) {
      items.push({ kind: 'day', key: `day-${day}`, label: dayLabel(sentAt, now) });
    }

    const next = messages[i + 1];
    const continues = (a, b) =>
      a && b &&
      a.sender.user === b.sender.user &&
      toISODate(new Date(a.createdAt)) === toISODate(new Date(b.createdAt)) &&
      new Date(b.createdAt) - new Date(a.createdAt) < RUN_GAP_MS;

    items.push({
      kind: 'message',
      key: message._id,
      message,
      mine: message.sender.user === myId,
      first: !continues(previous, message),
      last: !continues(message, next),
      time: time(sentAt)
    });
    previous = message;
    previousDay = day;
  });

  return items;
};

// Adds messages to a list (oldest first), skipping any it already has. A sent
// message can come back twice: once from sending and once from polling.
export const mergeMessages = (list, incoming) => {
  const have = new Set(list.map((m) => m._id));
  const added = incoming.filter((m) => !have.has(m._id));
  if (added.length === 0) return list;
  return [...list, ...added].sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
};
