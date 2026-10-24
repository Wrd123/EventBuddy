import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { Button } from '../common';

const Register = () => {
  const { register } = useAppContext();
  const location = useLocation();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: ''
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
    
    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    // Validate password length
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Remove confirmPassword before sending to API
      const { confirmPassword, ...userData } = formData;
      
      await register(userData);
      // On success the PublicOnly route redirects to where the user was going
    } catch (error) {
      setError(error.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 overflow-y-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-violet-soft mb-2">Join EventBuddy</h1>
          <p className="text-muted">Create your account</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-3 rounded relative">
              {error}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg/80 mb-1">
                First Name
              </label>
              <input
                type="text"
                name="firstName"
                className="field"
                placeholder="John"
                value={formData.firstName}
                onChange={handleChange}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-fg/80 mb-1">
                Last Name
              </label>
              <input
                type="text"
                name="lastName"
                className="field"
                placeholder="Doe"
                value={formData.lastName}
                onChange={handleChange}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-fg/80 mb-1">
              Username
            </label>
            <input
              type="text"
              name="username"
              className="field"
              placeholder="johndoe"
              value={formData.username}
              onChange={handleChange}
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-fg/80 mb-1">
              Email
            </label>
            <input
              type="email"
              name="email"
              className="field"
              placeholder="john@example.com"
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
          
          <div>
            <label className="block text-sm font-medium text-fg/80 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              name="confirmPassword"
              className="field"
              placeholder="••••••••"
              value={formData.confirmPassword}
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
            {isLoading ? 'Creating Account...' : 'Sign Up'}
          </Button>
        </form>
        
        <div className="mt-4 text-center">
          <p className="text-muted">
            Already have an account?{' '}
            <Link to="/login" state={location.state} className="text-violet-soft font-medium">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;