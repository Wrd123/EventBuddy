import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi } from '../../testUtils/fakeApi';
import { routerFuture } from '../../App';
import MainLayout from '../layout/MainLayout';

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
});

describe('event page', () => {
  it('shows unread messages and your balance on the buttons', async () => {
    installFakeApi().logIn();
    renderAt('/events/1');

    expect(await screen.findByRole('button', { name: 'Chat, 2 unread' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expenses, Owe $150.00' })).toBeInTheDocument();
  });

  it('marks who organized the event', async () => {
    installFakeApi({ liveEvent: true }).logIn();
    renderAt('/events/5');

    const organizer = (await screen.findByText('Organizer')).parentElement;
    expect(organizer).toHaveTextContent('Taylor');
  });
});
