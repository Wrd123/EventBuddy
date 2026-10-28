import { useEffect, useState } from 'react';
import { isDemoAvailable } from '../services/authService';

// Whether the server is the hosted demo, where there's a demo account to try
// and every account is temporary. False until the server says so.
export const useDemoAvailable = () => {
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isDemoAvailable().then(available => !cancelled && setDemo(available));
    return () => { cancelled = true; };
  }, []);

  return demo;
};
