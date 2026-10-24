import React from 'react';
import { Music, Map, Users, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../common/Header';
import Footer from '../layout/Footer';
import { groups } from '../../data/mockData';

const Groups = () => {
  const navigate = useNavigate();
  
  // Filter active and inactive groups
  const activeGroups = groups.filter(group => group.isActive);
  const pastGroups = groups.filter(group => !group.isActive);
  
  return (
    <div className="flex flex-col h-full">
      <Header title="Your Groups" />
      
      <div className="p-4 flex-1 overflow-y-auto">
        <div className="flex justify-between mb-4">
          <h2 className="text-lg font-semibold">Active Groups</h2>
          <button className="text-violet-soft text-sm font-medium flex items-center">
            <Plus size={16} className="mr-1" />
            Create New
          </button>
        </div>
        
        <div className="space-y-3 mb-6">
          {activeGroups.map(group => (
            <GroupCard 
              key={group._id} 
              group={group} 
              onClick={group.eventId ? () => navigate(`/events/${group.eventId}`) : undefined} 
            />
          ))}
        </div>
        
        <h2 className="text-lg font-semibold mb-3">Past Groups</h2>
        <div className="space-y-3">
          {pastGroups.map(group => (
            <GroupCard 
              key={group._id} 
              group={group} 
              isPast={true}
            />
          ))}
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

const GroupCard = ({ group, isPast = false, onClick }) => {
  // Map icon string to component
  const iconMap = {
    Music: Music,
    Map: Map,
    Users: Users
  };
  
  const GroupIcon = iconMap[group.icon];
  
  // Color classes based on group color
  const colorClasses = {
    purple: 'bg-violet/15 text-violet-soft',
    blue: 'bg-blue-500/15 text-blue-400',
    green: 'bg-go/15 text-go',
    gray: 'bg-raised text-muted'
  };
  
  return (
    <div 
      className={`card p-3 flex items-center ${isPast ? 'opacity-70' : ''}`}
      onClick={onClick}
    >
      <div className={`w-12 h-12 ${colorClasses[group.color]} rounded-xl flex items-center justify-center mr-3`}>
        <GroupIcon size={24} />
      </div>
      <div className="flex-1">
        <div className="font-medium">{group.name}</div>
        <div className="text-sm text-muted">{group.memberCount} members • {group.eventName}</div>
      </div>
      {group.notifications > 0 && (
        <div className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {group.notifications}
        </div>
      )}
    </div>
  );
};

export default Groups;