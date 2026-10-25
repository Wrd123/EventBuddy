import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useSharing, endShareOnServer } from '../../context/SharingContext';
import { untilText } from '../../utils/live';
import Header, { getInitials } from '../common/Header';
import { Button } from '../common';

// Logging out ends any location share first, while the login token still
// works. This phone stops tracking straight away either way. If the server
// can't be told, logging out waits for a decision, since friends would
// still see your last spot until the share runs out.
const useLogOut = () => {
  const { logout } = useAppContext();
  // unstopped: the share the server may still have, kept app-wide so the
  // warning is still here after leaving this screen
  const { share, setShare, unstopped, setUnstopped } = useSharing();
  const [busy, setBusy] = useState(false);

  const logOut = async () => {
    const pending = unstopped || share;
    if (!pending) {
      logout();
      return;
    }
    // Remembered before tracking stops, so it's never lost in between
    setUnstopped(pending);
    setShare(null);
    setBusy(true);
    try {
      await endShareOnServer(pending.eventId);
      setUnstopped(null);
      logout();
    } catch {
      setBusy(false);
    }
  };

  return { logOut, logOutAnyway: logout, unstopped: busy ? null : unstopped, busy };
};

const Profile = () => {
  // Logging out sends you to /login via the login guard (MainLayout)
  const { currentUser } = useAppContext();
  const { logOut, logOutAnyway, unstopped, busy } = useLogOut();

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Profile"
        type="screen"
        showBack={true}
        showProfile={false}
      />

      <div className="p-4 flex-1 flex flex-col overflow-y-auto">
        <div className="card p-6 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-accent text-night text-2xl font-semibold flex items-center justify-center mb-3">
            {getInitials(currentUser?.name) || '?'}
          </div>
          <div className="text-lg font-semibold">{currentUser?.name}</div>
          <div className="text-sm text-muted">{currentUser?.email}</div>
        </div>

        <GetPaid handles={currentUser?.paymentHandles} />

        {/* Logging out is rare on a phone, so it sits at the bottom, out of
            the way, rather than as a prominent primary button */}
        <div className="mt-auto">
          {unstopped ? (
            <div className="card p-4" role="alert">
              <p className="text-sm mb-3">
                Couldn't stop sharing your location on the server. Friends can still see your last spot {untilText(unstopped.until)}.
              </p>
              <div className="flex gap-2">
                <Button onClick={logOut} disabled={busy} className="flex-1">{busy ? 'Trying...' : 'Try again'}</Button>
                <Button variant="secondary" onClick={logOutAnyway} className="flex-1">Log out anyway</Button>
              </div>
            </div>
          ) : (
            <button
              onClick={logOut}
              disabled={busy}
              className="w-full flex items-center justify-center py-3 text-red-400 font-medium disabled:opacity-50"
            >
              <LogOut size={18} className="mr-2" />
              {busy ? 'Logging out...' : 'Log out'}
            </button>
          )}
        </div>
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
    <form onSubmit={handleSubmit} className="card p-4 mt-4">
      <h2 className="text-lg font-semibold">Get paid</h2>
      <p className="text-sm text-muted mb-3">
        Add how friends can pay you back. Only people in your events can see these.
      </p>

      {status.error && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-3 py-2 rounded mb-3 text-sm">{status.error}</div>
      )}

      {FIELDS.map(({ key, label, prefix, placeholder }) => (
        <div key={key} className="mb-3">
          <label htmlFor={`handle-${key}`} className="block text-sm font-medium text-fg/80 mb-1">{label}</label>
          <div className="flex items-center border border-line rounded-xl bg-raised overflow-hidden focus-within:border-accent">
            {prefix && <span className="pl-2 text-faint text-sm select-none">{prefix}</span>}
            <input
              id={`handle-${key}`}
              className="flex-1 p-2.5 outline-none min-w-0 bg-transparent placeholder-faint"
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
        <span className="text-sm text-go" role="status">{status.message}</span>
        <Button type="submit" size="sm" disabled={status.saving || !changed}>
          {status.saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  );
};

export default Profile;
