import React from 'react';

// Overlapping initials for an event's members, with "+N" past `max`
const AvatarStack = ({ members, max = 3, size = 'sm' }) => {
  const dims = size === 'md' ? 'w-9 h-9 text-sm' : 'w-6 h-6 text-xs';
  const extra = members.length - max;

  return (
    <div className="flex -space-x-2">
      {members.slice(0, max).map((member) => (
        <div
          key={member._id || member.user}
          className={`${dims} rounded-full ring-2 ring-surface flex items-center justify-center text-white font-semibold`}
          style={{ backgroundColor: member.color }}
          title={member.name}
        >
          {member.name.charAt(0)}
        </div>
      ))}
      {extra > 0 && (
        <div className={`${dims} rounded-full ring-2 ring-surface bg-raised text-muted flex items-center justify-center font-semibold`}>
          +{extra}
        </div>
      )}
    </div>
  );
};

export default AvatarStack;
