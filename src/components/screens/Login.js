import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { Button } from '../common';
import { Wordmark } from '../common/Header';
import { isDemoAvailable } from '../../services/authService';

const Login = () => {
  const { login, loginDemo } = useAppContext();
  // Where the user was going (e.g. an invite link), passed on to Sign up
  // too so a new account also lands there
  const location = useLocation();
  const fromInvite = location.state?.from?.pathname?.startsWith('/invite/');
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // The server says whether it's a demo; only then is there a demo account
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isDemoAvailable().then(available => !cancelled && setDemo(available));
    return () => { cancelled = true; };
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // On success the PublicOnly route redirects to where the user was going
  const run = async (signIn) => {
    setError('');
    setIsLoading(true);
    try {
      await signIn();
    } catch (err) {
      setError(err.message || "Couldn't log in. Check your email and password.");
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    run(() => login(formData));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 flex-1 flex flex-col justify-center">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight mb-2"><Wordmark /></h1>
          <p className="text-muted">Plan trips, shows and nights out with your friends</p>
        </div>

        {fromInvite && (
          <div className="bg-accent/10 border border-accent/40 text-accent-soft px-4 py-3 rounded-xl mb-4 text-center">
            Log in or sign up to see your invite.
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-3 rounded-xl mb-4" role="alert">
            {error}
          </div>
        )}

        {demo && (
          <div className="mb-6">
            <Button size="lg" fullWidth disabled={isLoading} onClick={() => run(loginDemo)}>
              Try the demo
            </Button>
            <p className="text-sm text-muted text-center mt-2">
              Signs you in as John, with friends, plans and chats ready to explore. It's your own copy, so change anything.
            </p>
            <div className="flex items-center mt-6 text-xs text-faint">
              <span className="flex-1 h-px bg-line" />
              <span className="px-3">or log in</span>
              <span className="flex-1 h-px bg-line" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-fg/80 mb-1">Email</label>
            <input
              id="login-email"
              type="email"
              name="email"
              autoComplete="email"
              className="field"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-fg/80 mb-1">Password</label>
            <input
              id="login-password"
              type="password"
              name="password"
              autoComplete="current-password"
              className="field"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          <Button
            type="submit"
            variant={demo ? 'secondary' : 'primary'}
            size="lg"
            fullWidth
            disabled={isLoading}
          >
            {isLoading ? 'Logging in...' : 'Log in'}
          </Button>
        </form>

        <p className="mt-4 text-center text-muted">
          New to EventBuddy?{' '}
          <Link to="/register" state={location.state} className="text-accent-soft font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
