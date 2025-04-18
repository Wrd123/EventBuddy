import React from 'react';
import { Bell, Menu, ArrowLeft } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

// Generic header component with options for different types
const Header = ({ 
  title, 
  type = 'default', 
  showBack = false, 
  showNotifications = true, 
  showMenu = true,
  backScreen = 'home'
}) => {
  const { navigateTo } = useAppContext();

  const handleBack = () => {
    navigateTo(backScreen);
  };

  return (
    <header className="p-4 bg-purple-600 text-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          {showBack && (
            <button onClick={handleBack} className="mr-2">
              <ArrowLeft size={20} />
            </button>
          )}
          <h1 className={type === 'default' ? "text-xl font-bold" : "text-lg font-bold"}>
            {title}
          </h1>
        </div>
        
        {(showNotifications || showMenu) && (
          <div className="flex space-x-3">
            {showNotifications && <Bell size={20} />}
            {showMenu && <Menu size={20} />}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;