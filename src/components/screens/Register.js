import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { Button } from '../common';
import { Wordmark } from '../common/Header';

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
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Join <Wordmark /></h1>
          <p className="text-muted">Plan with your friends in one place</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-3 rounded-xl" role="alert">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field id="register-first" label="First name" name="firstName" autoComplete="given-name" value={formData.firstName} onChange={handleChange} />
            <Field id="register-last" label="Last name" name="lastName" autoComplete="family-name" value={formData.lastName} onChange={handleChange} />
          </div>
          <Field id="register-username" label="Username" name="username" autoComplete="username" value={formData.username} onChange={handleChange} required />
          <Field id="register-email" label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={formData.email} onChange={handleChange} required />
          <Field
            id="register-password"
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            hint="At least 6 characters"
            value={formData.password}
            onChange={handleChange}
            required
          />
          <Field id="register-confirm" label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" value={formData.confirmPassword} onChange={handleChange} required />

          <Button type="submit" variant="primary" size="lg" fullWidth disabled={isLoading}>
            {isLoading ? 'Creating your account...' : 'Sign up'}
          </Button>
        </form>

        <p className="mt-4 text-center text-muted">
          Already have an account?{' '}
          <Link to="/login" state={location.state} className="text-violet-soft font-medium">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};

// A labeled text field; the label is tied to the input for screen readers
const Field = ({ id, label, hint, ...input }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-fg/80 mb-1">{label}</label>
    <input id={id} type="text" className="field" aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
    {hint && <p id={`${id}-hint`} className="text-xs text-faint mt-1">{hint}</p>}
  </div>
);

export default Register;