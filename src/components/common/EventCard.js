// src/components/common/EventCard.js
import React from 'react';

export const EventCard = ({ event, onSelect }) => (
  <div className="bg-white rounded-lg shadow p-3" onClick={onSelect}>
    <div className="flex">
      <img src="https://placehold.co/80x80" alt="Event" className="w-20 h-20 object-cover rounded-lg mr-3" />
      <div className="flex-1">
        <div className="font-medium">{event.name}</div>
        <div className="text-sm text-gray-500 mb-1">{event.date} • {event.location}</div>
        <div className="flex items-center">
          <div className="flex -space-x-2 mr-2">
            {event.members.slice(0, 3).map((member, index) => (
              <div key={index} className="w-6 h-6 rounded-full border border-white flex items-center justify-center text-white text-xs" style={{ backgroundColor: member.color }}>
                {member.name.charAt(0)}
              </div>
            ))}
            {event.members.length > 3 && (
              <div className="w-6 h-6 bg-gray-300 rounded-full border border-white flex items-center justify-center text-white text-xs">
                +{event.members.length - 3}
              </div>
            )}
          </div>
          <div className="text-xs text-gray-500">{event.members.length} attending</div>
        </div>
      </div>
    </div>
  </div>
);

// src/components/common/SuggestedEventCard.js
export const SuggestedEventCard = ({ event }) => (
  <div className="flex-shrink-0 w-40">
    <img src="https://placehold.co/160x120" alt="Event" className="w-full h-20 object-cover rounded-lg mb-2" />
    <div className="font-medium text-sm">{event.name}</div>
    <div className="text-xs text-gray-500">{event.date}</div>
  </div>
);

// src/components/common/Avatar.js
export const Avatar = ({ initial, color, size = 'md', status, onClick }) => {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-12 h-12 text-base'
  };

  return (
    <div className="relative" onClick={onClick}>
      <div 
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center text-white`}
        style={{ backgroundColor: color }}
      >
        {initial}
      </div>
      {status && (
        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border border-white"></div>
      )}
    </div>
  );
};

// src/components/common/Button.js
export const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  size = 'md',
  fullWidth = false,
  icon,
  className = ''
}) => {
  const variantClasses = {
    primary: 'bg-purple-600 text-white',
    secondary: 'bg-white text-gray-700 border border-gray-200',
    outline: 'bg-white text-purple-600 border border-purple-600',
    text: 'text-purple-600'
  };

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-4 py-2',
    lg: 'px-5 py-3 text-lg'
  };
  
  return (
    <button
      onClick={onClick}
      className={`
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        rounded-lg font-medium flex items-center justify-center
        ${className}
      `}
    >
      {icon && <span className="mr-2">{icon}</span>}
      {children}
    </button>
  );
};

// src/components/common/index.js
export * from './EventCard';
export * from './SuggestedEventCard';
export * from './Avatar';
export * from './Button';