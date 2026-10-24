import React from 'react';
import { Calendar, Users, Plus, Music, Map } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

// Floating tab bar with a raised, glowing create button in the middle
const Footer = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="shrink-0 px-3 pb-3 pt-1">
      <nav className="relative flex justify-around items-end rounded-3xl bg-surface/95 border border-line backdrop-blur px-2 pt-2 pb-2">
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

// The active tab is violet with a short bar under it
const NavItem = ({ Icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    aria-current={isActive ? 'page' : undefined}
    className={`flex flex-col items-center w-16 pt-1 ${isActive ? 'text-violet-soft' : 'text-muted'}`}
  >
    <Icon size={22} />
    <span className="text-xs mt-1 font-medium">{label}</span>
    <span className={`mt-1 h-0.5 w-8 rounded-full ${isActive ? 'bg-violet-soft' : 'bg-transparent'}`} />
  </button>
);

// Raised above the bar, ringed in the background color so it reads as
// floating
const CreateButton = ({ onClick }) => (
  <button
    onClick={onClick}
    className="-mt-9 w-16 h-16 rounded-full bg-gradient-to-b from-violet-soft to-violet-deep text-white flex items-center justify-center shadow-glow border-4 border-night"
    aria-label="Create event"
  >
    <Plus size={30} strokeWidth={2.5} />
  </button>
);

export default Footer;
