import React, { useState, useRef, useLayoutEffect } from 'react';
import { Send } from 'lucide-react';
import { useParams, useLocation, Link } from 'react-router-dom';
import Header from '../common/Header';
import { AvatarStack, ScreenLoader } from '../common';
import NotFound from './NotFound';
import { useEvent } from '../../hooks/useEvent';
import { useChat } from '../../hooks/useChat';
import { useAppContext } from '../../context/AppContext';
import { layoutChat } from '../../utils/chat';

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

  if (status === 'loading' || chat.status === 'loading') return <ScreenLoader />;
  if (status === 'not-found') {
    return <NotFound title="Event not found" message="This event doesn't exist or was deleted." />;
  }
  if (status === 'error') return <NotFound title="Couldn't load event" message={error} />;
  if (chat.status === 'error') return <NotFound title="Couldn't load the chat" message={chat.error} />;

  // Back to wherever the chat was opened from
  const backTo = location.state?.from === 'groups' ? '/groups' : `/events/${eventId}`;

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

      <Conversation event={event} chat={chat} />
      <Composer eventName={event.name} onSend={chat.send} />
    </div>
  );
};

const Conversation = ({ event, chat }) => {
  const { currentUser } = useAppContext();
  const scrollRef = useRef(null);
  const atBottom = useRef(true);
  // Distance from the bottom before older messages were added above, so the
  // view doesn't jump when they appear
  const keepPosition = useRef(null);

  const items = layoutChat(chat.messages, currentUser?._id);
  const colorOf = (userId) => event.members.find(m => m.user === userId)?.color || FORMER_MEMBER_COLOR;

  const oldestId = chat.messages[0]?._id;
  const newestKey = `${chat.messages.at(-1)?._id}-${chat.pending.length}`;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && keepPosition.current !== null) {
      el.scrollTop = el.scrollHeight - keepPosition.current;
      keepPosition.current = null;
    }
  }, [oldestId]);

  // Follow new messages, unless you've scrolled up to read older ones
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [newestKey]);

  const handleScroll = () => {
    const el = scrollRef.current;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  const loadEarlier = () => {
    const el = scrollRef.current;
    keepPosition.current = el.scrollHeight - el.scrollTop;
    chat.loadEarlier();
  };

  const nothingYet = chat.messages.length === 0 && chat.pending.length === 0;

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3" role="log" aria-label="Messages">
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
