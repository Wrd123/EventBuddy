import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import Header from '../common/Header';
import { chatMessages } from '../../data/mockData';

const GroupChat = () => {
  const { eventId } = useParams();
  const [message, setMessage] = useState('');

  const handleSendMessage = (e) => {
    e.preventDefault();
    // In a real app, we would add the message to the chat
    setMessage('');
  };

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Festival Squad" 
        type="screen" 
        showBack={true} 
        showProfile={false} 
        showNotifications={false} 
        backTo={`/events/${eventId}`}
      />
      
      <ChatMessages messages={chatMessages} />
      
      <MessageInput 
        message={message} 
        setMessage={setMessage} 
        handleSendMessage={handleSendMessage} 
      />
    </div>
  );
};

const ChatMessages = ({ messages }) => {
  return (
    <div className="flex-1 p-4 overflow-y-auto bg-raised">
      <div className="flex flex-col space-y-3">
        {messages.map((msg) => (
          <React.Fragment key={msg._id}>
            {msg.newDay && (
              <div className="flex items-center justify-center my-2">
                <div className="text-xs text-muted bg-raised px-2 py-1 rounded-full">
                  Today
                </div>
              </div>
            )}
            <ChatMessage message={msg} />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

const ChatMessage = ({ message }) => {
  if (message.isCurrentUser) {
    return (
      <div className="flex items-end justify-end">
        <div className="bg-violet/15 rounded-xl p-3 max-w-xs">
          <div className="text-sm">{message.message}</div>
          <div className="text-right text-xs text-muted mt-1">{message.time}</div>
        </div>
        <div className="w-8 h-8 bg-violet rounded-full flex items-center justify-center text-white ml-2">
          {message.senderInitial}
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex items-end">
      <div 
        className="w-8 h-8 rounded-full flex items-center justify-center text-white mr-2"
        style={{ backgroundColor: message.color }}
      >
        {message.senderInitial}
      </div>
      <div className="bg-surface rounded-xl p-3 max-w-xs">
        <div className="text-sm">{message.message}</div>
        <div className="text-right text-xs text-muted mt-1">{message.time}</div>
      </div>
    </div>
  );
};

const MessageInput = ({ message, setMessage, handleSendMessage }) => (
  <div className="p-3 bg-surface border-t border-line">
    <form onSubmit={handleSendMessage} className="flex items-center">
      <input
        type="text"
        className="flex-1 border border-line rounded-full py-2 px-4 mr-2"
        placeholder="Type a message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button 
        type="submit"
        className="w-10 h-10 bg-violet rounded-full flex items-center justify-center text-white"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </form>
  </div>
);

export default GroupChat;