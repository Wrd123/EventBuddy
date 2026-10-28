import React from 'react';
import Sheet from './Sheet';
import { describeActivity } from '../../utils/activity';
import { shortTime } from '../../utils/chat';

// One line of an event's activity: a dot in the person's member color (grey
// once they've left), what they did, and when. compact keeps it to a single
// line, for the event page; the sheet lets it wrap.
export const ActivityLine = ({ line, members, me, compact = false }) => {
  const color = members.find((m) => m.user === line.actor.user)?.color;
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        className={`mt-1.5 w-2 h-2 rounded-full shrink-0${color ? '' : ' bg-faint'}`}
        style={color ? { backgroundColor: color } : undefined}
        aria-hidden="true"
      />
      <span className={`flex-1 min-w-0 text-sm text-fg/90 ${compact ? 'truncate' : 'break-words'}`}>
        {describeActivity(line, me)}
      </span>
      <time dateTime={line.createdAt} className="shrink-0 text-xs leading-5 text-muted">{shortTime(line.createdAt)}</time>
    </li>
  );
};

// Everything that's happened in the event, newest first, with older lines a
// page at a time. activity: what useActivity returns.
const ActivitySheet = ({ activity, members, me, onClose }) => (
  <Sheet title="Activity" onClose={onClose} className="p-4 max-h-[85%] overflow-y-auto overscroll-y-contain">
    {activity.items.length > 0 ? (
      <ul className="divide-y divide-line">
        {activity.items.map((line) => <ActivityLine key={line._id} line={line} members={members} me={me} />)}
      </ul>
    ) : (
      <p className="py-3 text-sm text-muted">Nothing's happened here yet.</p>
    )}
    {activity.hasMore && (
      <button
        type="button"
        onClick={activity.loadOlder}
        disabled={activity.loadingOlder}
        className="mt-2 w-full h-11 rounded-full text-sm font-semibold text-accent-soft transition-transform active:scale-[0.98] disabled:text-faint"
      >
        {activity.loadingOlder ? 'Loading…' : 'Show earlier'}
      </button>
    )}
    {activity.olderError && <p className="mt-1 text-center text-sm text-red-400" role="alert">{activity.olderError}</p>}
  </Sheet>
);

export default ActivitySheet;
