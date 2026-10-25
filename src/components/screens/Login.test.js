import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi } from '../../testUtils/fakeApi';
import { todayISO } from '../../utils/dates';
import { routerFuture } from '../../App';
import MainLayout from '../layout/MainLayout';

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']} future={routerFuture}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

beforeEach(() => localStorage.clear());

describe('Login', () => {
  it('offers a one-tap demo when the server is a demo', async () => {
    installFakeApi({ demo: true });
    renderLogin();

    fireEvent.click(await screen.findByRole('button', { name: 'Try the demo' }));

    expect(await screen.findByText('Hey John!')).toBeInTheDocument();
    const signIn = global.fetch.mock.calls.find(([url]) => url === '/api/auth/demo');
    // No password involved: the server makes a private copy of the demo,
    // with its picnic on this phone's date
    expect(JSON.parse(signIn[1].body)).toEqual({ today: todayISO() });
  });

  it("doesn't offer the demo on a real server", async () => {
    installFakeApi();
    renderLogin();

    await screen.findByRole('button', { name: 'Log in' });
    await Promise.resolve();
    expect(global.fetch.mock.calls.some(([url]) => url === '/api/health')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Try the demo' })).not.toBeInTheDocument();
  });

  it('labels its fields for screen readers', async () => {
    installFakeApi();
    renderLogin();

    expect(await screen.findByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('placeholder');
  });

  it('explains a failed login', async () => {
    installFakeApi();
    renderLogin();

    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });
});
