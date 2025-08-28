// Mock authentication service
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Mock user data
const mockUser = {
  _id: '1',
  email: 'user@example.com',
  name: 'John Doe',
  avatar: null,
  createdAt: new Date().toISOString()
};

// Simulate localStorage for token
const TOKEN_KEY = 'eventbuddy_token';
const USER_KEY = 'eventbuddy_user';

export const login = async (credentials) => {
  await delay(1000); // Simulate network delay
  
  // Mock login validation
  if (credentials.email === 'user@example.com' && credentials.password === 'password') {
    const token = 'mock-jwt-token-' + Date.now();
    const user = { ...mockUser, email: credentials.email };
    
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    
    return {
      token,
      user,
      message: 'Login successful'
    };
  } else {
    throw new Error('Invalid email or password');
  }
};

export const register = async (userData) => {
  await delay(1000); // Simulate network delay
  
  // Mock registration
  const token = 'mock-jwt-token-' + Date.now();
  const user = {
    ...mockUser,
    _id: Date.now().toString(),
    email: userData.email,
    name: userData.name || userData.firstName + ' ' + userData.lastName
  };
  
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  
  return {
    token,
    user,
    message: 'Registration successful'
  };
};

export const logout = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const getCurrentUser = () => {
  const userStr = localStorage.getItem(USER_KEY);
  return userStr ? JSON.parse(userStr) : null;
};

export const getProfile = async () => {
  await delay(500);
  const user = getCurrentUser();
  if (!user) {
    throw new Error('Not authenticated');
  }
  return user;
};

export const updateProfile = async (profileData) => {
  await delay(500);
  const user = getCurrentUser();
  if (!user) {
    throw new Error('Not authenticated');
  }
  
  const updatedUser = { ...user, ...profileData };
  localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
  
  return {
    user: updatedUser,
    message: 'Profile updated successfully'
  };
};

export const isAuthenticated = () => {
  return !!localStorage.getItem(TOKEN_KEY);
};
