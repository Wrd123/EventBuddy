import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { Button } from '../common';
import { Wordmark } from '../common/Header';

const Login = () => {
  const { login } = useAppContext();
  // Where the user was going (e.g. an invite link), passed on to Sign up
  // too so a new account also lands there
  const location = useLocation();
  const fromInvite = location.state?.from?.pathname?.startsWith('/invite/');
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      await login(formData);
      // On success the PublicOnly route redirects to where the user was going
    } catch (error) {
      setError(error.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 flex-1 flex flex-col justify-center">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight mb-2"><Wordmark /></h1>
          <p className="text-muted">Group event planning made easy</p>
        </div>

        {fromInvite && (
          <div className="bg-violet/10 border border-violet/40 text-violet-soft px-4 py-3 rounded mb-4 text-center">
            Log in or sign up to see your invite.
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-3 rounded relative">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-fg/80 mb-1">
              Email
            </label>
            <input
              type="email"
              name="email"
              className="field"
              placeholder="your@email.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-fg/80 mb-1">
              Password
            </label>
            <input
              type="password"
              name="password"
              className="field"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>
          
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={isLoading}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </Button>
        </form>
        
        <div className="mt-4 text-center">
          <p className="text-muted">
            Don't have an account?{' '}
            <Link to="/register" state={location.state} className="text-violet-soft font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;