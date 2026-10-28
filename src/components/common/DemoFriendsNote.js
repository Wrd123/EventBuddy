import React from 'react';
import { useAppContext } from '../../context/AppContext';

// The demo's friends are made up, and some of them act on a script while you
// watch. Every screen where their messages, positions or costs show carries
// this line, so nobody takes them for real people. Nothing for real accounts.
const DemoFriendsNote = ({ className = '' }) => {
  const { currentUser } = useAppContext();
  if (!currentUser?.isDemo) return null;
  return (
    <p className={`text-xs text-faint ${className}`.trim()}>
      Demo friends are simulated. At the picnic, they chat, move and add costs while you're here.
    </p>
  );
};

export default DemoFriendsNote;
