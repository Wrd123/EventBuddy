import React from 'react';
import { Calendar, Users, Plus, Music, Map } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

const Footer = () => {
  const { navigateTo, currentScreen } = useAppContext();

  return (
    <div className="fixed bottom-0 w-full bg-white border-t border-gray-200">
      <nav className="flex justify-around p-3">
        <NavItem 
          Icon={Calendar} 
          label="Events" 
          isActive={currentScreen === 'home'} 
          onClick={() => navigateTo('home')} 
        />
        <NavItem 
          Icon={Users} 
          label="Groups" 
          isActive={currentScreen === 'groups'} 
          onClick={() => navigateTo('groups')} 
        />
        <CreateButton onClick={() => navigateTo('createEvent')} />
        <NavItem 
          Icon={Music} 
          label="Discover" 
          isActive={currentScreen === 'discover'} 
          onClick={() => navigateTo('discover')} 
        />
        <NavItem 
          Icon={Map} 
          label="Map" 
          isActive={currentScreen === 'map'} 
          onClick={() => navigateTo('map')} 
        />
      </nav>
    </div>
  );
};

// Helper component for navigation buttons
const NavItem = ({ Icon, label, isActive, onClick }) => (
  <button 
    onClick={onClick} 
    className={`flex flex-col items-center ${isActive ? 'text-purple-600' : 'text-gray-500'}`}
  >
    <Icon size={24} />
    <span className="text-xs mt-1">{label}</span>
  </button>
);

// Special styled create button
const CreateButton = ({ onClick }) => (
  <button 
    onClick={onClick} 
    className="flex flex-col items-center bg-purple-600 text-white rounded-full p-3 -mt-5"
  >
    <Plus size={24} />
  </button>
);

export default Footer;