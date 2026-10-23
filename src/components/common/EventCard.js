import React from 'react';

const EventCard = ({ event, onSelect }) => (
  <div className="bg-white rounded-lg shadow p-3" onClick={onSelect}>
    <div className="flex">
      <img src="https://placehold.co/80x80" alt="Event" className="w-20 h-20 object-cover rounded-lg mr-3" />
      <div className="flex-1">
        <div className="font-medium">{event.name}</div>
        <div className="text-sm text-gray-500 mb-1">{event.date} • {event.location}</div>
        <div className="flex items-center">
          <div className="flex -space-x-2 mr-2">
            {event.members.slice(0, 3).map((member) => (
              <div key={member._id} className="w-6 h-6 rounded-full border border-white flex items-center justify-center text-white text-xs" style={{ backgroundColor: member.color }}>
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

export default EventCard;
