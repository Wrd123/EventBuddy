import React from 'react';
import { CalendarDays, MessageCircle, Plus, Compass, Map } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

// Space the floating tab bar takes at the bottom of the screen. Screens
// with a tab bar pad their scrolling content by this much, so the last item
// can scroll out from under the glass.
export const TAB_BAR_CLEARANCE = 'pb-28';

// A floating pane of frosted glass over the bottom of the screen, with a
// solid white create button in the middle: the one loud control
const Footer = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 px-4 pb-4 pointer-events-none">
      <nav className="glass pointer-events-auto flex justify-around items-center h-[68px] rounded-[34px] px-1.5 shadow-float">
        <NavItem Icon={CalendarDays} label="Plans" isActive={pathname === '/'} onClick={() => navigate('/')} />
        <NavItem Icon={MessageCircle} label="Chats" isActive={pathname === '/groups'} onClick={() => navigate('/groups')} />
        <button
          onClick={() => navigate('/create')}
          className="w-[50px] h-[50px] rounded-full bg-fg text-night flex items-center justify-center shadow-[0_6px_20px_rgba(255,255,255,0.22)] transition-transform active:scale-90"
          aria-label="Create event"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
        <NavItem Icon={Compass} label="Discover" isActive={pathname === '/discover'} onClick={() => navigate('/discover')} />
        <NavItem Icon={Map} label="Map" isActive={pathname === '/map'} onClick={() => navigate('/map')} />
      </nav>
    </div>
  );
};

// The active tab is bright white; the rest are dimmed
const NavItem = ({ Icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    aria-current={isActive ? 'page' : undefined}
    className={`tap flex flex-col items-center gap-0.5 w-14 transition-colors ${isActive ? 'text-fg' : 'text-fg/55'}`}
  >
    <Icon size={22} strokeWidth={isActive ? 2.2 : 1.9} />
    <span className={`text-[11px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{label}</span>
  </button>
);

export default Footer;
