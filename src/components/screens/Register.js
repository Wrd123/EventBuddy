import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { Button, Field } from '../common';
import { Wordmark } from '../common/Header';
import { MIN_PASSWORD_LENGTH, newPasswordProblem } from '../../utils/password';

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
    
    const problem = newPasswordProblem(formData.password, formData.confirmPassword);
    if (problem) {
      setError(problem);
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
            hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
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
          <Link to="/login" state={location.state} className="text-accent-soft font-medium">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;