import React from 'react';
import { Music, Map, Users, Plus } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Header from '../common/Header';
import Footer from '../layout/Footer';
import { groups } from '../../data/mockData';

const Groups = () => {
  const { navigateTo } = useAppContext();
  
  // Filter active and inactive groups
  const activeGroups = groups.filter(group => group.isActive);
  const pastGroups = groups.filter(group => !group.isActive);
  
  return (
    <div className="flex flex-col h-full">
      <Header title="Your Groups" />
      
      <div className="p-4 flex-1 overflow-y-auto pb-16">
        <div className="flex justify-between mb-4">
          <h2 className="text-lg font-semibold">Active Groups</h2>
          <button className="text-purple-600 text-sm font-medium flex items-center">
            <Plus size={16} className="mr-1" />
            Create New
          </button>
        </div>
        
        <div className="space-y-3 mb-6">
          {activeGroups.map(group => (
            <GroupCard 
              key={group.id} 
              group={group} 
              onClick={() => navigateTo('eventDetails')} 
            />
          ))}
        </div>
        
        <h2 className="text-lg font-semibold mb-3">Past Groups</h2>
        <div className="space-y-3">
          {pastGroups.map(group => (
            <GroupCard 
              key={group.id} 
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
    purple: 'bg-purple-100 text-purple-600',
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    gray: 'bg-gray-100 text-gray-500'
  };
  
  return (
    <div 
      className={`bg-white rounded-lg shadow p-3 flex items-center ${isPast ? 'opacity-70' : ''}`}
      onClick={onClick}
    >
      <div className={`w-12 h-12 ${colorClasses[group.color]} rounded-lg flex items-center justify-center mr-3`}>
        <GroupIcon size={24} />
      </div>
      <div className="flex-1">
        <div className="font-medium">{group.name}</div>
        <div className="text-sm text-gray-500">{group.memberCount} members • {group.eventName}</div>
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