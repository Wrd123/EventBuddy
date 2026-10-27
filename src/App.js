import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import MainLayout from './components/layout/MainLayout';
import ErrorBoundary from './components/common/ErrorBoundary';
import ShowcaseFrame from './components/layout/ShowcaseFrame';
import ServerWake from './components/layout/ServerWake';

const App = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        {/* The frame shows right away; the app inside waits for the server */}
        <ShowcaseFrame>
          <ServerWake>
            <AppProvider>
              <MainLayout />
            </AppProvider>
          </ServerWake>
        </ShowcaseFrame>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
