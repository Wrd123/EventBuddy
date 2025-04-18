import React from 'react';

const Button = ({ 
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

export default Button;