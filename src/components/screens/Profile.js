import React from 'react';
import { useAppContext } from '../../context/AppContext';
import Header from '../common/Header';

const Profile = () => {
  const { currentUser, logout, navigateTo } = useAppContext();

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Profile" 
        type="screen" 
        showBack={true} 
        showMenu={false} 
        showNotifications={false}
      />
      
      <div className="p-4 flex-1">
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h3 className="text-lg font-semibold mb-2">User Profile</h3>
          {currentUser ? (
            <div>
              <p><strong>Name:</strong> {currentUser.name}</p>
              <p><strong>Email:</strong> {currentUser.email}</p>
            </div>
          ) : (
            <p>Not logged in</p>
          )}
        </div>
        
        <button
          onClick={logout}
          className="w-full bg-red-600 text-white py-2 rounded-lg"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default Profile;
