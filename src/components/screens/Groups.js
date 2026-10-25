import React from 'react';
import { MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../common/Header';
import Footer from '../layout/Footer';
import { Button, EventCover, ScreenLoader } from '../common';
import { useChats } from '../../hooks/useChats';
import { useAppContext } from '../../context/AppContext';
import { getEventStatus } from '../../utils/dates';
import { shortTime } from '../../utils/chat';

// Every event you plan or join is a group with its own chat. Upcoming and
// ongoing events first, past ones below, each by latest activity.
const Groups = () => {
  const { status, chats, error, reload } = useChats();

  if (status === 'loading') return <ScreenLoader />;

  const current = chats.filter(chat => getEventStatus(chat) !== 'past');
  const past = chats.filter(chat => getEventStatus(chat) === 'past');

  return (
    <div className="flex flex-col h-full">
      <Header title="Groups" />

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {status === 'error' ? (
          <div className="card p-5 text-center">
            <p className="font-semibold mb-1">Couldn't load your groups</p>
            <p className="text-sm text-muted mb-3">{error}</p>
            <Button variant="secondary" onClick={reload} className="mx-auto">Try again</Button>
          </div>
        ) : chats.length === 0 ? (
          <NoGroups />
        ) : (
          <>
            <ChatList chats={current} />
            {past.length > 0 && (
              <>
                <h2 className="text-sm font-semibold text-muted mt-6 mb-2">Past events</h2>
                <ChatList chats={past} />
              </>
            )}
          </>
        )}
      </div>

      <Footer />
    </div>
  );
};

const NoGroups = () => {
  const navigate = useNavigate();
  return (
    <div className="card p-6 text-center mt-2">
      <div className="w-14 h-14 rounded-full bg-violet/15 text-violet-soft flex items-center justify-center mx-auto mb-3">
        <MessageCircle size={26} />
      </div>
      <h2 className="text-xl font-bold mb-1">No groups yet</h2>
      <p className="text-sm text-muted mb-4">Every event you plan or join gets a group chat for everyone going.</p>
      <Button onClick={() => navigate('/create')} fullWidth>Plan an event</Button>
    </div>
  );
};

const ChatList = ({ chats }) => (
  <ul className="space-y-2">
    {chats.map(chat => <ChatRow key={chat.eventId} chat={chat} />)}
  </ul>
);

const ChatRow = ({ chat }) => {
  const navigate = useNavigate();
  const { currentUser } = useAppContext();
  const { lastMessage, unread } = chat;

  const preview = lastMessage
    ? `${lastMessage.sender.user === currentUser?._id ? 'You' : lastMessage.sender.name}: ${lastMessage.text}`
    : `No messages yet • ${chat.memberCount} ${chat.memberCount === 1 ? 'member' : 'members'}`;
  const label = unread > 0 ? `${chat.name}, ${unread} unread` : chat.name;

  return (
    <li>
      <button
        onClick={() => navigate(`/events/${chat.eventId}/chat`, { state: { from: 'groups' } })}
        className="card w-full p-3 flex items-center text-left"
        aria-label={label}
      >
        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 mr-3">
          <EventCover event={{ _id: chat.eventId, type: chat.type, coverIndex: chat.coverIndex }} width={48} className="w-full h-full" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between">
            <span className={`truncate ${unread > 0 ? 'font-bold' : 'font-semibold'}`}>{chat.name}</span>
            {lastMessage && (
              <span className={`text-xs shrink-0 ml-2 ${unread > 0 ? 'text-violet-soft font-semibold' : 'text-faint'}`}>
                {shortTime(lastMessage.createdAt)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className={`text-sm truncate ${unread > 0 ? 'text-fg' : 'text-muted'}`}>{preview}</span>
            {unread > 0 && (
              <span className="ml-2 shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-violet text-white text-xs font-bold flex items-center justify-center" aria-hidden="true">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
};

export default Groups;
