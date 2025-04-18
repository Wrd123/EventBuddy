import React from 'react';

const Avatar = ({ initial, color, size = 'md', status, onClick }) => {
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

export default Avatar;