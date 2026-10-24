import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Header, { getInitials } from '../common/Header';
import { Button } from '../common';

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

        <GetPaid handles={currentUser?.paymentHandles} />

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

const FIELDS = [
  { key: 'venmo', label: 'Venmo', prefix: '@', placeholder: 'your-username' },
  { key: 'cashapp', label: 'Cash App', prefix: '$', placeholder: 'cashtag' },
  { key: 'paypal', label: 'PayPal', prefix: 'paypal.me/', placeholder: 'yourname' },
  { key: 'zelle', label: 'Zelle', prefix: '', placeholder: 'Email or phone your bank uses' }
];

// Where friends can send you money from Settle up. All optional; shown only
// to people who share an event with you.
const GetPaid = ({ handles = {} }) => {
  const { updateProfile } = useAppContext();
  const initial = Object.fromEntries(FIELDS.map(f => [f.key, handles[f.key] || '']));
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState({ saving: false, message: '', error: '' });

  const changed = FIELDS.some(f => values[f.key] !== initial[f.key]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ saving: true, message: '', error: '' });
    try {
      const { user } = await updateProfile({ paymentHandles: values });
      // Show what the server kept (it strips pasted "@", "$" and links)
      setValues(Object.fromEntries(FIELDS.map(f => [f.key, user.paymentHandles?.[f.key] || ''])));
      setStatus({ saving: false, message: 'Saved', error: '' });
    } catch (err) {
      setStatus({ saving: false, message: '', error: err.message });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 mt-4">
      <h2 className="text-lg font-semibold">Get paid</h2>
      <p className="text-sm text-gray-500 mb-3">
        Add how friends can pay you back. Only people in your events can see these.
      </p>

      {status.error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-3 text-sm">{status.error}</div>
      )}

      {FIELDS.map(({ key, label, prefix, placeholder }) => (
        <div key={key} className="mb-3">
          <label htmlFor={`handle-${key}`} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
          <div className="flex items-center border border-gray-300 rounded-lg bg-white overflow-hidden">
            {prefix && <span className="pl-2 text-gray-400 text-sm select-none">{prefix}</span>}
            <input
              id={`handle-${key}`}
              className="flex-1 p-2 outline-none min-w-0"
              placeholder={placeholder}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={values[key]}
              onChange={e => {
                const value = e.target.value;
                setValues(prev => ({ ...prev, [key]: value }));
                setStatus(prev => ({ ...prev, message: '' }));
              }}
            />
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <span className="text-sm text-green-700" role="status">{status.message}</span>
        <Button type="submit" size="sm" disabled={status.saving || !changed}>
          {status.saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  );
};

export default Profile;
