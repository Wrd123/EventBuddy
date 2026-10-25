import React, { useEffect, useState } from 'react';
import { Calendar, MessageSquare, DollarSign, Map, MapPin, Plus, ExternalLink, Pencil } from 'lucide-react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import Header from '../common/Header';
import { Avatar, EventCover, ScreenLoader } from '../common';
import NotFound from './NotFound';
import InviteSheet from '../common/InviteSheet';
import { useAppContext } from '../../context/AppContext';
import { useEvent } from '../../hooks/useEvent';
import { formatDateRange, formatDay, getEventStatus, defaultScheduleDay } from '../../utils/dates';
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
      {/* The photo runs under the header, which only has actions */}
      <Header
        type="screen"
        showBack
        showProfile={false}
        overPhoto
        action={isOrganizer && (
          <Link
            to={`/events/${eventId}/edit`}
            className="flex items-center rounded-full bg-black/45 backdrop-blur px-3 py-1.5 text-sm font-semibold text-white"
          >
            <Pencil size={14} className="mr-1.5 text-violet-soft" aria-hidden="true" />
            Edit
          </Link>
        )}
      />

      <div className="flex-1 overflow-y-auto pb-16">
        <EventHero event={event} />
        {event.description && (
          <p className="px-4 pt-4 text-fg/90 whitespace-pre-wrap break-words">{event.description}</p>
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
            className="mx-4 mt-3 flex items-center justify-center py-2.5 rounded-xl border border-violet/50 text-violet-soft font-semibold"
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

// Edge-to-edge photo that fades into the page, with the name and dates
// underneath it rather than printed over it
const EventHero = ({ event }) => (
  <>
    <div className="relative h-64">
      <EventCover event={event} width={430} className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-night to-transparent" />
    </div>
    <div className="px-4 -mt-2">
      <h1 className="text-3xl font-extrabold tracking-tight break-words">{event.name}</h1>
      <p className="font-semibold text-violet-soft">{formatDateRange(event.startDate, event.endDate)}</p>
      {event.location && (
        <p className="flex items-center text-muted">
          <MapPin size={15} className="mr-1.5 shrink-0" aria-hidden="true" />
          {event.location}
        </p>
      )}
    </div>
  </>
);

const EventActions = ({ eventId, unread, balance }) => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-4 gap-2 px-4 pt-4">
      <ActionButton
        Icon={Calendar}
        label="Schedule"
        onClick={() => navigate(`/events/${eventId}/schedule`)}
      />
      <ActionButton
        Icon={MessageSquare}
        label="Chat"
        badge={unread}
        onClick={() => navigate(`/events/${eventId}/chat`)}
      />
      <ActionButton
        Icon={DollarSign}
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

// badge: an unread count on the icon. hint: a short status under the label.
const ActionButton = ({ Icon, label, badge = 0, hint = '', onClick }) => (
  <button
    onClick={onClick}
    className="card relative flex flex-col items-center py-3 px-1 text-fg/90"
    aria-label={[label, badge > 0 && `${badge} unread`, hint].filter(Boolean).join(', ')}
  >
    <Icon size={20} className="text-violet-soft" aria-hidden="true" />
    <span className="text-xs mt-1.5 font-medium">{label}</span>
    {hint && <span className="text-[11px] text-muted leading-tight mt-0.5">{hint}</span>}
    {badge > 0 && (
      <span className="absolute top-1.5 right-1.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-violet text-white text-[11px] font-bold flex items-center justify-center" aria-hidden="true">
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
    <div className="p-4">
      <h3 className="text-xl font-bold mb-3">Who's going</h3>
      <div className="flex space-x-2 mb-4 overflow-x-auto no-scrollbar">
        {event.members.map((member) => (
          // shrink-0 so a big group scrolls instead of squashing
          <div key={member._id} className="flex flex-col items-center shrink-0">
            <Avatar 
              initial={member.name.charAt(0)} 
              color={member.color} 
              size="md" 
            />
            <span className="text-xs mt-1">{member.name}</span>
            {member.user === event.createdBy && (
              <span className="text-[10px] font-semibold text-violet-soft leading-none mt-0.5">Organizer</span>
            )}
          </div>
        ))}
        <button onClick={onInvite} className="flex flex-col items-center shrink-0">
          <div className="w-8 h-8 bg-violet/15 rounded-full flex items-center justify-center text-violet-soft border border-dashed border-violet/40">
            <Plus size={16} />
          </div>
          <span className="text-xs mt-1">Invite</span>
        </button>
      </div>
    
      <h3 className="text-xl font-bold mb-3">{heading}</h3>
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

const ScheduleItem = ({ item }) => (
  <div className="card p-3">
    <div className="flex justify-between items-start">
      <div>
        <div className="text-sm text-muted">{formatTimeRange(item.startTime, item.endTime)}</div>
        <div className="font-semibold">{item.activity}</div>
        <div className="text-sm text-muted">{item.location}</div>
      </div>
      <div className="chip shrink-0 ml-2">
        {item.attendees.length} going
      </div>
    </div>
  </div>
);

export default EventDetails;