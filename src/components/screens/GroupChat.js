import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { ArrowDown, Send } from 'lucide-react';
import { useParams, useLocation, Link } from 'react-router-dom';
import Header from '../common/Header';
import { AvatarStack, DemoFriendsNote, Skeleton, SkeletonScreen } from '../common';
import NotFound from './NotFound';
import { useEvent } from '../../hooks/useEvent';
import { useChat } from '../../hooks/useChat';
import { useAppContext } from '../../context/AppContext';
import { usePresence } from '../../hooks/usePresence';
import { layoutChat } from '../../utils/chat';
import { listNames } from '../../utils/map';
import { tap } from '../../services/haptics';
import { isVisible } from '../../hooks/usePolling';

// For someone who has left the event since they wrote
const FORMER_MEMBER_COLOR = '#64748b';
const MAX_LENGTH = 1000;
// Within this far of the bottom counts as "reading the latest"
const NEAR_BOTTOM_PX = 80;

// An event's group chat: everyone in the event, live while it's open
const GroupChat = () => {
  const { eventId } = useParams();
  const location = useLocation();
  const { event, status, error } = useEvent(eventId);
  const chat = useChat(eventId);
  const here = usePresence(eventId);

  // Back to wherever the chat was opened from
  const backTo = location.state?.from === 'groups' ? '/groups' : `/events/${eventId}`;

  if (status === 'loading' || chat.status === 'loading') return <ChatSkeleton name={event?.name} backTo={backTo} />;
  if (status === 'not-found') {
    return <NotFound title="Event not found" message="This event doesn't exist or was deleted." />;
  }
  if (status === 'error') return <NotFound title="Couldn't load event" message={error} />;
  if (chat.status === 'error') return <NotFound title="Couldn't load the chat" message={chat.error} />;

  return (
    <div className="flex flex-col h-full">
      <Header title={event.name} type="screen" showBack backTo={backTo} showProfile={false} />
      <Link
        to={`/events/${eventId}`}
        className="flex items-center px-4 pb-3 -mt-1 text-sm text-muted border-b border-line"
      >
        <AvatarStack members={event.members} max={4} />
        <span className="ml-2">
          {event.members.length} {event.members.length === 1 ? 'member' : 'members'} • Event details
        </span>
      </Link>
      <HereNow event={event} here={here} />
      <DemoFriendsNote className="shrink-0 px-4 py-2 border-b border-line" />

      <Conversation event={event} chat={chat} />
      <Composer eventName={event.name} onSend={chat.send} />
    </div>
  );
};

// Who else in the event has the app open, under the header. Always in the
// page (empty when nobody is), so screen readers hear people arrive.
const HereNow = ({ event, here }) => {
  const names = event.members.filter(m => here.has(m.user)).map(m => m.name.split(' ')[0]);
  return (
    <div role="status" className={names.length > 0 ? 'flex items-center gap-2 px-4 py-2 text-xs text-muted border-b border-line' : 'sr-only'}>
      {names.length > 0 && (
        <>
          <span className="w-2 h-2 rounded-full bg-go shrink-0" aria-hidden="true" />
          <span className="truncate">Here now: {listNames(names)}</span>
        </>
      )}
    </div>
  );
};

// The chat's outline: bubbles from both sides and the composer bar. The
// header and its Back button are real; the event's name fills in if known.
const ChatSkeleton = ({ name, backTo }) => (
  <div className="flex flex-col h-full">
    <Header title={name} type="screen" showBack backTo={backTo} showProfile={false} />
    <SkeletonScreen label="Loading the chat" className="flex-1 overflow-hidden px-4 py-3 space-y-3 border-t border-line">
      <Skeleton className="h-10 w-2/3 rounded-2xl rounded-bl-md" />
      <Skeleton className="h-16 w-1/2 rounded-2xl rounded-bl-md" />
      <Skeleton className="h-10 w-3/5 rounded-2xl rounded-br-md ml-auto" />
      <Skeleton className="h-12 w-2/3 rounded-2xl rounded-bl-md" />
    </SkeletonScreen>
    <div className="px-3 py-3 border-t border-line" aria-hidden="true">
      <Skeleton className="h-11 rounded-full" />
    </div>
  </div>
);

const Conversation = ({ event, chat }) => {
  const { currentUser } = useAppContext();
  const scrollRef = useRef(null);
  const atBottom = useRef(true);
  // Distance from the bottom before older messages were added above, so the
  // view doesn't jump when they appear
  const keepPosition = useRef(null);
  // Someone else wrote while you were scrolled up
  const [hasUnseen, setHasUnseen] = useState(false);
  const { markSeen } = chat;

  const items = layoutChat(chat.messages, currentUser?._id);
  const colorOf = (userId) => event.members.find(m => m.user === userId)?.color || FORMER_MEMBER_COLOR;

  const oldestId = chat.messages[0]?._id;
  const newestId = chat.messages.at(-1)?._id;
  const newestRef = useRef(newestId);
  newestRef.current = newestId;
  const newestKey = `${newestId}-${chat.pending.length}`;
  // The newest message the last check ended on, so a batch that ends with
  // your own send still counts someone else's message before it
  const seenUpTo = useRef(newestId);
  const sentCount = useRef(chat.pending.length);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && keepPosition.current !== null) {
      el.scrollTop = el.scrollHeight - keepPosition.current;
      keepPosition.current = null;
    }
  }, [oldestId]);

  // Follow new messages, unless you've scrolled up to read older ones.
  // Sending something takes you down to it, as in any chat app.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (chat.pending.length > sentCount.current) {
      atBottom.current = true;
      setHasUnseen(false);
    }
    sentCount.current = chat.pending.length;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [newestKey, chat.pending.length]);

  // The newest message counts as seen only when it's in view; otherwise
  // the pill offers to jump to it
  useEffect(() => {
    if (!newestId) return;
    const previous = seenUpTo.current;
    seenUpTo.current = newestId;
    if (atBottom.current) {
      markSeen(newestId);
      return;
    }
    const arrived = previous ? chat.messages.filter(m => m._id > previous) : chat.messages;
    if (arrived.some(m => m.sender.user !== currentUser?._id)) setHasUnseen(true);
  }, [newestId, chat.messages, currentUser, markSeen]);

  // Coming back to the app with the latest already in view: it's seen now
  useEffect(() => {
    const onVisible = () => {
      if (isVisible() && atBottom.current) markSeen(newestRef.current);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markSeen]);

  const reachedBottom = () => {
    setHasUnseen(false);
    markSeen(newestId);
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    const wasAtBottom = atBottom.current;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (atBottom.current && !wasAtBottom) reachedBottom();
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    reachedBottom();
    // The pill goes away under the finger; keep focus in the conversation
    el.focus({ preventScroll: true });
  };

  const loadEarlier = () => {
    const el = scrollRef.current;
    keepPosition.current = el.scrollHeight - el.scrollTop;
    chat.loadEarlier();
  };

  const nothingYet = chat.messages.length === 0 && chat.pending.length === 0;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div ref={scrollRef} onScroll={handleScroll} tabIndex={-1} className="flex-1 overflow-y-auto px-4 py-3 focus:outline-none" role="log" aria-label="Messages">
        {chat.hasMore && (
          <div className="text-center mb-3">
            <button onClick={loadEarlier} disabled={chat.loadingEarlier} className="chip tap text-sm">
              {chat.loadingEarlier ? 'Loading...' : 'Load earlier messages'}
            </button>
          </div>
        )}

        {nothingYet && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <p className="font-semibold mb-1">No messages yet</p>
            <p className="text-sm text-muted">Start planning with everyone going to {event.name}.</p>
          </div>
        )}

        {items.map(item =>
          item.kind === 'day' ? (
            <div key={item.key} className="flex justify-center my-3">
              <span className="glass text-xs text-muted px-3 py-1 rounded-full">{item.label}</span>
            </div>
          ) : (
            <MessageRow key={item.key} item={item} color={colorOf(item.message.sender.user)} />
          )
        )}

        {chat.pending.map(p => (
          <PendingRow key={p.tempId} pending={p} onRetry={() => chat.retry(p.tempId)} onDiscard={() => chat.discard(p.tempId)} />
        ))}
      </div>

      {hasUnseen && (
        <button
          onClick={jumpToLatest}
          className="bg-raised border border-line absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 h-11 px-4 rounded-full text-sm font-semibold text-fg shadow-lg transition-transform active:scale-95"
        >
          <ArrowDown size={16} aria-hidden="true" />
          New messages
        </button>
      )}
    </div>
  );
};

const MessageRow = ({ item, color }) => {
  const { message, mine, first, last, time } = item;
  const spacing = first ? 'mt-3' : 'mt-0.5';

  if (mine) {
    return (
      <div className={`flex flex-col items-end ${spacing}`}>
        <div className={`bg-fg text-night px-3.5 py-2 rounded-2xl ${last ? 'rounded-br-md' : ''} max-w-[80%] whitespace-pre-wrap break-words`}>
          {message.text}
        </div>
        {last && <span className="text-[11px] text-faint mt-1 mr-1">{time}</span>}
      </div>
    );
  }

  return (
    <div className={`flex items-end ${spacing}`}>
      {/* The avatar sits beside the last message of a run; a spacer keeps the others lined up */}
      <div className="w-8 shrink-0 mr-2">
        {last && (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          >
            {message.sender.name.charAt(0)}
          </div>
        )}
      </div>
      <div className="flex flex-col items-start max-w-[80%] min-w-0">
        {first && <span className="text-xs font-semibold mb-1 ml-1" style={{ color }}>{message.sender.name}</span>}
        <div className={`bg-white/[0.09] border border-line px-3.5 py-2 rounded-2xl ${last ? 'rounded-bl-md' : ''} whitespace-pre-wrap break-words max-w-full`}>
          {message.text}
        </div>
        {last && <span className="text-[11px] text-faint mt-1 ml-1">{time}</span>}
      </div>
    </div>
  );
};

const PendingRow = ({ pending, onRetry, onDiscard }) => (
  <div className="flex flex-col items-end mt-3">
    <div className={`bg-fg text-night px-3.5 py-2 rounded-2xl rounded-br-md max-w-[80%] whitespace-pre-wrap break-words ${pending.failed ? 'opacity-50' : 'opacity-70'}`}>
      {pending.text}
    </div>
    {pending.failed ? (
      <div className="text-xs mt-1 mr-1 flex items-center gap-4" role="alert">
        <span className="text-red-300">Not sent</span>
        <button onClick={onRetry} className="tap font-semibold text-accent-soft">Retry</button>
        <button onClick={onDiscard} className="tap text-muted">Delete</button>
      </div>
    ) : (
      <span className="text-[11px] text-faint mt-1 mr-1">Sending...</span>
    )}
  </div>
);

const Composer = ({ eventName, onSend }) => {
  const [text, setText] = useState('');
  const trimmed = text.trim();

  const submit = (e) => {
    e.preventDefault();
    if (!trimmed) return;
    tap();
    onSend(trimmed);
    setText('');
  };

  return (
    <form onSubmit={submit} className="glass border-x-0 border-b-0 px-3 py-3 flex items-center space-x-2">
      <input
        aria-label="Message"
        className="field rounded-full flex-1"
        placeholder={`Message ${eventName}`}
        maxLength={MAX_LENGTH}
        enterKeyHint="send"
        autoComplete="off"
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <button
        type="submit"
        disabled={!trimmed}
        className="w-11 h-11 shrink-0 rounded-full bg-fg text-night flex items-center justify-center disabled:opacity-40"
        aria-label="Send"
      >
        <Send size={18} />
      </button>
    </form>
  );
};

export default GroupChat;
