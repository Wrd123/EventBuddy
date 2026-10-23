import React from 'react';
import { LogOut } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Header, { getInitials } from '../common/Header';

const Profile = () => {
  // Logging out sends you to /login via the login guard (MainLayout)
  const { currentUser, logout } = useAppContext();

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Profile"
        type="screen"
        showBack={true}
        showProfile={false}
        showNotifications={false}
      />

      <div className="p-4 flex-1 flex flex-col overflow-y-auto">
        <div className="bg-white rounded-lg shadow p-6 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-purple-600 text-white text-2xl font-semibold flex items-center justify-center mb-3">
            {getInitials(currentUser?.name) || '?'}
          </div>
          <div className="text-lg font-semibold">{currentUser?.name}</div>
          <div className="text-sm text-gray-500">{currentUser?.email}</div>
        </div>

        {/* Logging out is rare on a phone, so it sits at the bottom, out of
            the way, rather than as a prominent primary button */}
        <button
          onClick={logout}
          className="mt-auto w-full flex items-center justify-center py-3 text-red-600 font-medium"
        >
          <LogOut size={18} className="mr-2" />
          Log Out
        </button>
      </div>
    </div>
  );
};

export default Profile;
