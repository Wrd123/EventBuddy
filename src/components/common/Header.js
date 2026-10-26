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

// The wordmark: plain and white, letting the photos carry the color. It
// takes its size from where it sits, so a big title stays big.
export const Wordmark = ({ className = '' }) => <span className={`tracking-[-0.03em] ${className}`}>EventBuddy</span>;

// Screen header on the night background. Top-level tabs show your avatar; inner screens show a back arrow instead, and can put an
// action (like Edit) on the right. A screen whose content starts with its
// own big title can leave title out. subtitle (inner screens) names what
// the screen belongs to, like the event. overPhoto floats the header over
// a full-width photo. Its round buttons are frosted glass either way, so
// they read on a photo or on the night background.
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
    // Marked as a way back so the screen slides in from the left
    navigate(backTo, { state: { back: true } });
  };

  return (
    <header className={`${overPhoto ? 'absolute inset-x-0 top-0' : 'relative'} z-10 px-4 pt-4 pb-3 text-fg`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center min-w-0">
          {showBack && (
            <button
              onClick={handleBack}
              className="glass mr-3 w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-fg transition-transform active:scale-90"
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          {title && (
            <div className="min-w-0">
              <h1 className={`${type === 'default' ? 'text-[28px] font-bold tracking-[-0.03em]' : 'text-lg font-semibold tracking-[-0.01em]'} truncate`}>
                {title === 'EventBuddy' ? <Wordmark className="text-[19px]" /> : title}
              </h1>
              {subtitle && <p className="text-sm text-muted truncate -mt-0.5">{subtitle}</p>}
            </div>
          )}
        </div>

        {action && <div className="shrink-0 ml-3">{action}</div>}

        {showProfile && (
          <button
            onClick={() => navigate('/profile')}
            className="glass w-11 h-11 shrink-0 rounded-full text-fg text-[13px] font-semibold flex items-center justify-center transition-transform active:scale-90"
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
