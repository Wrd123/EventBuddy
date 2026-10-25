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
    // Solid white pills: Afterglow's one loud control, readable on any photo
    primary: 'bg-fg text-night hover:bg-white',
    secondary: 'bg-white/[0.08] text-fg border border-line',
    outline: 'bg-transparent text-accent-soft border border-accent/60',
    text: 'text-accent-soft'
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
        rounded-full font-semibold flex items-center justify-center
        transition-transform active:scale-[0.97]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
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
