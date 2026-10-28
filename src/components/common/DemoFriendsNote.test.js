import React from 'react';
import { render, screen } from '@testing-library/react';
import { AppProvider, useAppContext } from '../../context/AppContext';
import { installFakeApi } from '../../testUtils/fakeApi';
import DemoFriendsNote from './DemoFriendsNote';

const NOTE = "Demo friends are simulated. At the picnic, they chat, move and add costs while you're here.";

// Shows up once the logged-in account has loaded
const SignedInAs = () => {
  const { currentUser } = useAppContext();
  return currentUser ? <span data-testid="signed-in" /> : null;
};

beforeEach(() => localStorage.clear());

describe('DemoFriendsNote', () => {
  it('says the friends are simulated to a demo account', async () => {
    installFakeApi({ demoAccount: true }).logIn();
    render(<AppProvider><DemoFriendsNote className="mt-2" /></AppProvider>);

    const note = await screen.findByText(NOTE);
    expect(note).toHaveClass('text-xs', 'text-faint', 'mt-2');
  });

  it('says nothing to a real account', async () => {
    installFakeApi().logIn();
    render(<AppProvider><SignedInAs /><DemoFriendsNote /></AppProvider>);

    // Only once the account has loaded does "nothing" mean anything
    await screen.findByTestId('signed-in');
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });
});
