import React from 'react';
import { Calendar, Users, Plus, Music, Map } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const Footer = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="shrink-0 bg-white border-t border-gray-200">
      <nav className="flex justify-around p-3">
        <NavItem 
          Icon={Calendar} 
          label="Events" 
          isActive={pathname === '/'} 
          onClick={() => navigate('/')} 
        />
        <NavItem 
          Icon={Users} 
          label="Groups" 
          isActive={pathname === '/groups'} 
          onClick={() => navigate('/groups')} 
        />
        <CreateButton onClick={() => navigate('/create')} />
        <NavItem 
          Icon={Music} 
          label="Discover" 
          isActive={pathname === '/discover'} 
          onClick={() => navigate('/discover')} 
        />
        <NavItem 
          Icon={Map} 
          label="Map" 
          isActive={pathname === '/map'} 
          onClick={() => navigate('/map')} 
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
    aria-label="Create event"
  >
    <Plus size={24} />
  </button>
);

export default Footer;