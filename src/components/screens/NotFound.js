import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../common/Header';
import { Button } from '../common';

// Shown for unknown URLs, and by event screens when the event id doesn't exist
const NotFound = ({ title = 'Page not found', message = "We couldn't find what you were looking for." }) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full">
      <Header
        title={title}
        type="screen"
        showBack={true}
        showProfile={false}
        showNotifications={false}
      />

      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-muted mb-6">{message}</p>
        <Button onClick={() => navigate('/')} variant="primary">
          Go to Home
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
