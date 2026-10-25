import React from 'react';
import { Bell, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';

// "John Doe" -> "JD", "Cher" -> "C"
export const getInitials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');

// The two-tone wordmark from the design: "Event" in white, "Buddy" in violet
export const Wordmark = () => (
  <span>
    Event<span className="text-violet-soft">Buddy</span>
  </span>
);

// Screen header on the night background. Top-level tabs show the bell and
// your avatar; inner screens show a back arrow instead, and can put an
// action (like Edit) on the right. A screen whose content starts with its
// own big title can leave title out.
const Header = ({
  title,
  type = 'default',
  showBack = false,
  showNotifications = true,
  showProfile = true,
  backTo = '/',
  action = null
}) => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();

  // Back goes to a fixed parent screen rather than browser history, so it
  // still works when the app was opened straight to this URL
  const handleBack = () => {
    navigate(backTo);
  };

  return (
    <header className="relative z-10 px-4 pt-4 pb-3 text-fg">
      <div className="flex items-center justify-between">
        <div className="flex items-center min-w-0">
          {showBack && (
            <button onClick={handleBack} className="mr-2 -ml-1 p-1 rounded-full text-muted hover:text-fg" aria-label="Back">
              <ArrowLeft size={22} />
            </button>
          )}
          {title && (
            <h1 className={`${type === 'default' ? 'text-2xl font-extrabold tracking-tight' : 'text-lg font-bold'} truncate`}>
              {title === 'EventBuddy' ? <Wordmark /> : title}
            </h1>
          )}
        </div>

        {action && <div className="shrink-0 ml-3">{action}</div>}

        {(showNotifications || showProfile) && (
          <div className="flex items-center space-x-3 shrink-0">
            {showNotifications && <Bell size={22} className="text-muted" aria-hidden="true" />}
            {showProfile && (
              <button
                onClick={() => navigate('/profile')}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-soft to-violet-deep text-white text-sm font-bold flex items-center justify-center shadow-glow-sm"
                aria-label="Open profile"
              >
                {getInitials(currentUser?.name) || '?'}
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
