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

// Generic header component with options for different types
const Header = ({
  title,
  type = 'default',
  showBack = false,
  showNotifications = true,
  showProfile = true,
  backTo = '/'
}) => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();

  // Back goes to a fixed parent screen rather than browser history, so it
  // still works when the app was opened straight to this URL
  const handleBack = () => {
    navigate(backTo);
  };

  return (
    <header className="p-4 bg-purple-600 text-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          {showBack && (
            <button onClick={handleBack} className="mr-2" aria-label="Back">
              <ArrowLeft size={20} />
            </button>
          )}
          <h1 className={type === 'default' ? "text-xl font-bold" : "text-lg font-bold"}>
            {title}
          </h1>
        </div>

        {(showNotifications || showProfile) && (
          <div className="flex items-center space-x-3">
            {showNotifications && <Bell size={20} />}
            {showProfile && (
              <button
                onClick={() => navigate('/profile')}
                className="w-8 h-8 rounded-full bg-white text-purple-600 text-sm font-semibold flex items-center justify-center"
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
