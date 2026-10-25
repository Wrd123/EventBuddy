import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import MainLayout from './components/layout/MainLayout';
import ErrorBoundary from './components/common/ErrorBoundary';
import ShowcaseFrame from './components/layout/ShowcaseFrame';

// Opt in to React Router v7 behavior now so upgrading later is a version bump
export const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

const App = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter future={routerFuture}>
        <AppProvider>
          <ShowcaseFrame>
            <MainLayout />
          </ShowcaseFrame>
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
