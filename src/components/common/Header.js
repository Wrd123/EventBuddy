import React from 'react';
import { ArrowLeft } from 'lucide-react';
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

// Screen header on the night background. Top-level tabs show your avatar; inner screens show a back arrow instead, and can put an
// action (like Edit) on the right. A screen whose content starts with its
// own big title can leave title out. subtitle (inner screens) names what
// the screen belongs to, like the event. overPhoto floats the header over
// a full-width photo, with the back arrow on a dark circle so it stays visible.
const Header = ({
  title,
  subtitle = '',
  type = 'default',
  showBack = false,
  showProfile = true,
  backTo = '/',
  action = null,
  overPhoto = false
}) => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();

  // Back goes to a fixed parent screen rather than browser history, so it
  // still works when the app was opened straight to this URL
  const handleBack = () => {
    navigate(backTo);
  };

  return (
    <header className={`${overPhoto ? 'absolute inset-x-0 top-0' : 'relative'} z-10 px-4 pt-4 pb-3 text-fg`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center min-w-0">
          {showBack && (
            <button
              onClick={handleBack}
              className={overPhoto
                ? 'mr-2 p-2 rounded-full bg-black/45 backdrop-blur text-white'
                : 'mr-2 -ml-1 p-1 rounded-full text-muted hover:text-fg'}
              aria-label="Back"
            >
              <ArrowLeft size={22} />
            </button>
          )}
          {title && (
            <div className="min-w-0">
              <h1 className={`${type === 'default' ? 'text-2xl font-extrabold tracking-tight' : 'text-lg font-bold'} truncate`}>
                {title === 'EventBuddy' ? <Wordmark /> : title}
              </h1>
              {subtitle && <p className="text-sm text-muted truncate -mt-0.5">{subtitle}</p>}
            </div>
          )}
        </div>

        {action && <div className="shrink-0 ml-3">{action}</div>}

        {showProfile && (
          <button
            onClick={() => navigate('/profile')}
            className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-violet-soft to-violet-deep text-white text-sm font-bold flex items-center justify-center shadow-glow-sm"
            aria-label="Open profile"
          >
            {getInitials(currentUser?.name) || '?'}
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
