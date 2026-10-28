// Recent activity in an event: the sentence for each line, and keeping the
// pages the app has loaded as one list without gaps. Lines come from the
// server newest first, and their ids sort in the order they were written.
import { formatCents } from './money';

// What an edit's changed details are called in a sentence, in the order
// the server lists them. Both dates read as "dates".
const FIELD_NAMES = {
  name: 'name',
  type: 'event type',
  startDate: 'dates',
  endDate: 'dates',
  location: 'place',
  description: 'description',
  ticketUrl: 'ticket link',
  budgetCents: 'budget'
};

// "a", "a and b", "a, b and c"
const and = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);

// A line as a sentence, seen by myId: your own lines start with "You", and
// a payment to or from you says "you". Names are people's own input, so
// the screen shows this as text, never as markup.
export const describeActivity = ({ actor, kind, data = {} }, myId) => {
  const mine = actor.user === myId;
  const who = mine ? 'You' : actor.name;
  const them = (person) => (person.user === myId ? 'you' : person.name);

  switch (kind) {
    case 'joined':
      return `${who} joined`;
    case 'left':
      return `${who} left`;
    case 'schedule_added':
      return `${who} added ${data.activity} to the schedule`;
    case 'expense_added':
      return `${who} added ${data.description} (${formatCents(data.amountCents)})`;
    case 'payment_marked': {
      // Either side can record a payment, and EventBuddy only knows it was
      // recorded, not that the money moved, so that's what the line says
      const amount = formatCents(data.amountCents);
      return data.from.user === actor.user
        ? `${who} recorded a payment of ${amount} to ${them(data.to)}`
        : `${who} recorded a payment of ${amount} from ${them(data.from)}`;
    }
    case 'meetup_set':
      return `${who} set the meetup point`;
    case 'sharing_started':
      return `${who} started sharing ${mine ? 'your' : 'their'} location`;
    default: {
      // event_updated, and anything a newer server sends that this app
      // doesn't know yet
      const changed = [...new Set((data.fields || []).map((field) => FIELD_NAMES[field]).filter(Boolean))];
      return changed.length > 0 ? `${who} changed the ${and(changed)}` : `${who} updated the event`;
    }
  }
};

// The lines loaded so far, newest first, and whether there are older ones.
// gen moves on whenever the list is replaced, so an older page asked for
// before that can't be added to a list it no longer belongs to.
export const emptyFeed = { gen: 0, items: [], hasMore: false };

const replace = (feed, items, hasMore) => ({ gen: feed.gen + 1, items, hasMore });

// Nothing kept, and nothing asked for before can be added: for losing
// access to the event, or switching to another one
export const clearFeed = (feed) => replace(feed, [], false);

// A fresh newest page ({ activity, hasMore }). It's the truth for everything
// as new as it goes: new lines show and lines that were taken back go.
// Older lines already loaded stay below it, and so does whether there are
// more of them, since the page's hasMore is about its own end, not the list's.
// When the page is all there is, or doesn't reach the lines loaded (more
// than a page arrived while away), it replaces the list, so there's never
// a gap in the middle.
export const mergeNewest = (feed, { activity, hasMore }) => {
  if (!hasMore) return replace(feed, activity, false);
  const reach = activity.at(-1)._id;
  if (feed.items.length === 0 || reach > feed.items[0]._id) return replace(feed, activity, true);
  return { ...feed, items: [...activity, ...feed.items.filter((line) => line._id < reach)] };
};

// An older page ({ activity, hasMore }), asked for while the list was at gen
export const appendOlder = (feed, { activity, hasMore }, gen) => {
  if (feed.gen !== gen) return feed;
  const end = feed.items.at(-1)?._id;
  return {
    ...feed,
    items: [...feed.items, ...activity.filter((line) => end === undefined || line._id < end)],
    hasMore
  };
};
