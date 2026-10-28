import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi } from '../../testUtils/fakeApi';
import MainLayout from '../layout/MainLayout';

const renderRegister = () =>
  render(
    <MemoryRouter initialEntries={['/register']}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

beforeEach(() => localStorage.clear());

describe('Register', () => {
  it('warns that accounts on the demo server are temporary', async () => {
    installFakeApi({ demo: true });
    renderRegister();

    expect(await screen.findByText(/accounts and everything in them are deleted whenever it restarts/)).toBeInTheDocument();
  });

  it("doesn't warn about a temporary account on a real server", async () => {
    installFakeApi();
    renderRegister();

    await screen.findByRole('heading', { level: 1, name: /Join/ });
    // Let the server's answer about being a demo arrive before checking
    await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => url === '/api/health')).toBe(true));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByText(/deleted whenever it restarts/)).not.toBeInTheDocument();
  });
});
