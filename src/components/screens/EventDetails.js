import React, { useEffect, useState } from 'react';
import { CalendarDays, MessageCircle, Wallet, Map, MapPin, Plus, ExternalLink, Pencil } from 'lucide-react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import Header from '../common/Header';
import { Avatar, EventCover, PhotoBackdrop, ScreenLoader } from '../common';
import NotFound from './NotFound';
import InviteSheet from '../common/InviteSheet';
import { useAppContext } from '../../context/AppContext';
import { useEvent } from '../../hooks/useEvent';
import { formatDateRange, formatDay, getEventStatus, defaultScheduleDay, daysUntil } from '../../utils/dates';
import { formatTimeRange, sortSchedule } from '../../utils/schedule';
import { computeBalances } from '../../utils/ledger';
import { formatCents } from '../../utils/money';
import * as chatService from '../../services/chatService';
import * as eventService from '../../services/eventService';

// What's waiting behind the Chat and Expenses buttons: unread messages and
// your balance in cents (null until known, or if there are no expenses).
// Loaded once; each screen has the live version.
const useEventSummary = (eventId) => {
  const [summary, setSummary] = useState({ unread: 0, ledger: null });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([chatService.getChats(), eventService.getLedger(eventId)]).then(([chats, ledger]) => {
      if (cancelled) return;
      setSummary({
        unread: chats.status === 'fulfilled' ? chats.value.find(c => c.eventId === eventId)?.unread ?? 0 : 0,
        ledger: ledger.status === 'fulfilled' ? ledger.value : null
      });
    });
    return () => { cancelled = true; };
  }, [eventId]);

  return summary;
};

// "You owe $12.50" style hint for the Expenses button, or '' if there's
// nothing to say yet
const balanceHint = (event, ledger, me) => {
  if (!ledger || ledger.expenses.length === 0) return '';
  const mine = computeBalances(event.members, ledger.expenses, ledger.payments).find(b => b.user === me);
  if (!mine || mine.netCents === 0) return 'All settled';
  return mine.netCents > 0 ? `Owed ${formatCents(mine.netCents)}` : `Owe ${formatCents(-mine.netCents)}`;
};

const EventDetails = () => {
  const { eventId } = useParams();
  const { event, status, error } = useEvent(eventId);
  const { currentUser } = useAppContext();
  const summary = useEventSummary(eventId);
  // Create Event sends new organizers here with the invite sheet open
  const location = useLocation();
  const [showInvite, setShowInvite] = useState(Boolean(location.state?.showInvite));

  if (status === 'loading') return <ScreenLoader />;
  if (status === 'not-found') {
    return <NotFound title="Event not found" message="This event doesn't exist or was deleted." />;
  }
  if (status === 'error') {
    return <NotFound title="Couldn't load event" message={error} />;
  }

  const isOrganizer = event.createdBy === currentUser?._id;

  return (
    <div className="flex flex-col h-full relative">
      <PhotoBackdrop event={event} />
      {/* The photo runs under the header, which only has actions */}
      <Header
        type="screen"
        showBack
        showProfile={false}
        overPhoto
        action={isOrganizer && (
          <Link
            to={`/events/${eventId}/edit`}
            className="glass flex items-center h-10 rounded-full px-4 text-sm font-semibold text-fg transition-transform active:scale-95"
          >
            <Pencil size={14} className="mr-1.5" aria-hidden="true" />
            Edit
          </Link>
        )}
      />

      <div className="relative flex-1 overflow-y-auto pb-16">
        <EventHero event={event} />
        {event.description && (
          <p className="px-5 pt-4 text-fg/85 leading-relaxed whitespace-pre-wrap break-words">{event.description}</p>
        )}
        <EventActions
          eventId={eventId}
          unread={summary.unread}
          balance={balanceHint(event, summary.ledger, currentUser?._id)}
        />
        {event.ticketUrl && (
          // Events planned from Discover keep their ticket page
          <a
            href={event.ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="card mx-4 mt-3 flex items-center justify-center h-12 rounded-full text-fg font-semibold transition-transform active:scale-[0.98]"
          >
            Get tickets <ExternalLink size={16} className="ml-2" aria-hidden="true" />
          </a>
        )}
        <EventContent event={event} onInvite={() => setShowInvite(true)} />
      </div>

      {showInvite && (
        <InviteSheet
          event={event}
          isOrganizer={isOrganizer}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  );
};

// Where the event stands, for the pill over the photo
const statusText = (event) => {
  const status = getEventStatus(event);
  if (status === 'ongoing') return 'Happening now';
  if (status === 'past') return `Ended ${formatDay(event.endDate)}`;
  const days = daysUntil(event.startDate);
  return days === 1 ? 'Starts tomorrow' : `${days} days to go`;
};

// The photo edge to edge, fading into its own blurred glow, with the name
// and dates set on the page below it rather than printed over it
const EventHero = ({ event }) => {
  const live = getEventStatus(event) === 'ongoing';
  return (
    <>
      <div className="relative h-[340px] [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]">
        <EventCover event={event} width={430} className="absolute inset-0 w-full h-full" />
      </div>
      <div className="relative px-5 -mt-24 flex flex-col gap-1.5">
        <span className="glass self-start flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-semibold">
          {live && <span className="w-2 h-2 rounded-full bg-go shadow-[0_0_10px_#4ade80]" aria-hidden="true" />}
          {statusText(event)}
        </span>
        <h1 className="mt-1 text-[34px] leading-[1.04] font-bold tracking-[-0.035em] break-words">{event.name}</h1>
        <p className="font-semibold text-accent-soft">{formatDateRange(event.startDate, event.endDate)}</p>
        {event.location && (
          <p className="flex items-center text-fg/75">
            <MapPin size={15} className="mr-1.5 shrink-0" aria-hidden="true" />
            {event.location}
          </p>
        )}
      </div>
    </>
  );
};

const EventActions = ({ eventId, unread, balance }) => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-4 gap-2.5 px-4 pt-5">
      <ActionButton
        Icon={CalendarDays}
        label="Schedule"
        onClick={() => navigate(`/events/${eventId}/schedule`)}
      />
      <ActionButton
        Icon={MessageCircle}
        label="Chat"
        badge={unread}
        onClick={() => navigate(`/events/${eventId}/chat`)}
      />
      <ActionButton
        Icon={Wallet}
        label="Expenses"
        hint={balance}
        onClick={() => navigate(`/events/${eventId}/expenses`)}
      />
      <ActionButton
        Icon={Map}
        label="Map"
        onClick={() => navigate('/map', { state: { focus: eventId } })}
      />
    </div>
  );
};

// A glass tile. badge: an unread count on its corner. hint: a short status
// under the label, like what you owe.
const ActionButton = ({ Icon, label, badge = 0, hint = '', onClick }) => (
  <button
    onClick={onClick}
    className="card relative flex flex-col items-center justify-center min-h-[84px] py-3 px-1 rounded-[22px] text-fg transition-transform duration-200 active:scale-95"
    aria-label={[label, badge > 0 && `${badge} unread`, hint].filter(Boolean).join(', ')}
  >
    <Icon size={22} strokeWidth={1.9} aria-hidden="true" />
    <span className="text-xs mt-1.5 font-semibold">{label}</span>
    {hint && <span className="text-[11px] text-accent-soft font-medium leading-tight mt-0.5">{hint}</span>}
    {badge > 0 && (
      <span className="absolute top-2 right-2 min-w-[1.25rem] h-5 px-1 rounded-full bg-fg text-night text-[11px] font-bold flex items-center justify-center" aria-hidden="true">
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);

const EventContent = ({ event, onInvite }) => {
  // Preview one day: today while the event is running, else its first day.
  // The Schedule screen shows every day.
  const day = defaultScheduleDay(event);
  const items = sortSchedule(event.schedule.filter(item => item.date === day));
  const heading = getEventStatus(event) === 'ongoing' ? "Today's schedule" : `Schedule for ${formatDay(day)}`;

  return (
    <div className="px-4 pt-7">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg font-semibold tracking-[-0.01em]">Who's going</h3>
        <span className="text-sm text-fg/60">{event.members.length} {event.members.length === 1 ? 'person' : 'people'}</span>
      </div>
      <div className="flex gap-3.5 mb-7 overflow-x-auto no-scrollbar -mx-4 px-4">
        {event.members.map((member) => (
          // shrink-0 so a big group scrolls instead of squashing
          <div key={member._id} className="flex flex-col items-center shrink-0 w-12">
            <Avatar
              initial={member.name.charAt(0)}
              color={member.color}
              size="lg"
            />
            <span className="text-xs mt-1.5 text-fg/85 truncate max-w-full">{member.name.split(' ')[0]}</span>
            {member.user === event.createdBy && (
              <span className="text-[10px] font-semibold text-accent-soft leading-none mt-0.5">Organizer</span>
            )}
          </div>
        ))}
        <button onClick={onInvite} className="flex flex-col items-center shrink-0 w-12">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-fg border-[1.5px] border-dashed border-white/40 transition-transform active:scale-90">
            <Plus size={18} />
          </div>
          <span className="text-xs mt-1.5 text-fg/85">Invite</span>
        </button>
      </div>
    
      <h3 className="text-lg font-semibold tracking-[-0.01em] mb-3">{heading}</h3>
      {items.length > 0 ? (
        <div className="flex flex-col space-y-3">
          {items.map((item) => (
            <ScheduleItem key={item._id} item={item} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Nothing scheduled for this day yet.</p>
      )}
    </div>
  );
};

// Time on the left, set apart by a hairline, like a lineup card
const ScheduleItem = ({ item }) => (
  <div className="card flex items-center gap-3.5 px-4 py-3.5 rounded-[22px]">
    <div className="w-[68px] shrink-0 text-[13px] font-semibold leading-snug text-fg/90">{formatTimeRange(item.startTime, item.endTime)}</div>
    <span className="w-px self-stretch bg-white/15" aria-hidden="true" />
    <div className="flex-1 min-w-0">
      <div className="font-semibold truncate">{item.activity}</div>
      {item.location && <div className="text-[13px] text-fg/65 truncate">{item.location}</div>}
    </div>
    <div className="chip shrink-0">{item.attendees.length} going</div>
  </div>
);

export default EventDetails;