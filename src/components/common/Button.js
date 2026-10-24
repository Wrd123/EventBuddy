import React from 'react';

const Button = ({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
  fullWidth = false,
  icon,
  className = '',
  ...rest
}) => {
  const variantClasses = {
    primary: 'bg-violet text-white shadow-glow-sm hover:bg-violet-deep',
    secondary: 'bg-raised text-fg border border-line',
    outline: 'bg-transparent text-violet-soft border border-violet/60',
    text: 'text-violet-soft'
  };

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-4 py-2',
    lg: 'px-5 py-3 text-lg'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        rounded-xl font-semibold flex items-center justify-center
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
      {...rest}
    >
      {icon && <span className="mr-2">{icon}</span>}
      {children}
    </button>
  );
};

export default Button;
