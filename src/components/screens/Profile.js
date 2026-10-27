import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useSharing, endShareOnServer } from '../../context/SharingContext';
import * as authService from '../../services/authService';
import { untilText } from '../../utils/live';
import { MIN_PASSWORD_LENGTH, newPasswordProblem } from '../../utils/password';
import Header, { getInitials } from '../common/Header';
import { Button, Field } from '../common';

// Logging out ends any location share first, then the login itself on the
// server, both while the login token still works. This phone stops
// tracking straight away either way. If the server can't be told, logging
// out waits for a decision: friends would still see your last spot until
// the share runs out, and the login would keep working until it expires.
const useLogOut = () => {
  const { logout } = useAppContext();
  // unstopped: the share the server may still have, kept app-wide so the
  // warning is still here after leaving this screen
  const { share, setShare, unstopped, setUnstopped } = useSharing();
  const [busy, setBusy] = useState(false);
  // The server couldn't be told to end the login
  const [loginLeft, setLoginLeft] = useState(false);

  const logOut = async () => {
    setBusy(true);
    setLoginLeft(false);
    const pending = unstopped || share;
    if (pending) {
      // Remembered before tracking stops, so it's never lost in between
      setUnstopped(pending);
      setShare(null);
      try {
        await endShareOnServer(pending.eventId);
        setUnstopped(null);
      } catch {
        setBusy(false);
        return;
      }
    }
    try {
      await authService.endSession();
    } catch {
      setBusy(false);
      setLoginLeft(true);
      return;
    }
    logout();
  };

  return {
    logOut,
    logOutAnyway: logout,
    unstopped: busy ? null : unstopped,
    loginLeft: !busy && loginLeft,
    busy
  };
};

const Profile = () => {
  // Logging out sends you to /login via the login guard (MainLayout)
  const { currentUser } = useAppContext();
  const { logOut, logOutAnyway, unstopped, loginLeft, busy } = useLogOut();

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

        {/* A demo account has no password; it signs in with one tap */}
        {currentUser && !currentUser.isDemo && <ChangePassword />}

        {/* Logging out is rare on a phone, so it sits at the bottom, out of
            the way, rather than as a prominent primary button */}
        <div className="mt-auto">
          {unstopped || loginLeft ? (
            <div className="card p-4 mt-4" role="alert">
              <p className="text-sm mb-3">
                {unstopped
                  ? `Couldn't stop sharing your location on the server. Friends can still see your last spot ${untilText(unstopped.until)}.`
                  : "Couldn't reach EventBuddy to end this login. Logging out anyway only ends it on this phone."}
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
              className="w-full flex items-center justify-center py-3 mt-4 text-red-400 font-medium disabled:opacity-50"
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

const EMPTY_PASSWORDS = { currentPassword: '', newPassword: '', confirmation: '' };

// Changing your password logs you out everywhere else, which is also how
// to end a login you think someone else has. This phone stays logged in.
const ChangePassword = () => {
  const { changePassword } = useAppContext();
  const [values, setValues] = useState(EMPTY_PASSWORDS);
  const [status, setStatus] = useState({ saving: false, message: '', error: '' });

  const set = (key) => (e) => {
    const value = e.target.value;
    setValues(prev => ({ ...prev, [key]: value }));
    setStatus(prev => ({ ...prev, message: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const problem = newPasswordProblem(values.newPassword, values.confirmation);
    if (problem) {
      setStatus({ saving: false, message: '', error: problem });
      return;
    }
    setStatus({ saving: true, message: '', error: '' });
    try {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      setValues(EMPTY_PASSWORDS);
      setStatus({ saving: false, message: 'Password changed. Other devices are logged out.', error: '' });
    } catch (err) {
      setStatus({ saving: false, message: '', error: err.message });
    }
  };

  const complete = values.currentPassword && values.newPassword && values.confirmation;

  return (
    <form onSubmit={handleSubmit} className="card p-4 mt-4">
      <h2 className="text-lg font-semibold mb-3">Password</h2>

      {status.error && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-3 py-2 rounded mb-3 text-sm" role="alert">{status.error}</div>
      )}

      <div className="space-y-3 mb-3">
        <Field id="password-current" label="Current password" type="password" autoComplete="current-password" value={values.currentPassword} onChange={set('currentPassword')} />
        <Field
          id="password-new"
          label="New password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. A few words together works well.`}
          value={values.newPassword}
          onChange={set('newPassword')}
        />
        <Field id="password-confirm" label="Confirm new password" type="password" autoComplete="new-password" value={values.confirmation} onChange={set('confirmation')} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-go" role="status">{status.message}</span>
        <Button type="submit" size="sm" disabled={status.saving || !complete} className="shrink-0">
          {status.saving ? 'Changing...' : 'Change'}
        </Button>
      </div>
    </form>
  );
};

export default Profile;
