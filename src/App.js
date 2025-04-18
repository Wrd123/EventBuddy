import React from 'react';
import { AppProvider } from './context/AppContext';
import MainLayout from './components/layout/MainLayout';

const App = () => {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
};

export default App;