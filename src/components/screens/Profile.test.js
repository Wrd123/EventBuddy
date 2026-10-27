import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi, failNext, settle } from '../../testUtils/fakeApi';
import MainLayout from '../layout/MainLayout';

const renderProfile = () =>
  render(
    <MemoryRouter initialEntries={['/profile']}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

const requests = (method, url) =>
  global.fetch.mock.calls.filter(([u, options = {}]) => u === url && (options.method || 'GET') === method);

beforeEach(() => localStorage.clear());

describe('logging out', () => {
  it('ends the login on the server, then on this phone', async () => {
    installFakeApi().logIn();
    renderProfile();

    fireEvent.click(await screen.findByRole('button', { name: /Log out/ }));

    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    const [[, sent]] = requests('POST', '/api/auth/logout');
    expect(sent.headers.Authorization).toBe('Bearer fake-token');
    expect(localStorage.getItem('eventbuddy_token')).toBeNull();
  });

  it("says so when the server can't be reached, and lets you retry", async () => {
    installFakeApi().logIn();
    failNext('POST', '/auth/logout');
    renderProfile();

    fireEvent.click(await screen.findByRole('button', { name: /Log out/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't reach EventBuddy to end this login. Logging out anyway only ends it on this phone."
    );
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByLabelText('Email');
    expect(requests('POST', '/api/auth/logout')).toHaveLength(2);
  });

  it('can log out on this phone anyway', async () => {
    installFakeApi().logIn();
    failNext('POST', '/auth/logout');
    renderProfile();

    fireEvent.click(await screen.findByRole('button', { name: /Log out/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Log out anyway' }));

    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expect(requests('POST', '/api/auth/logout')).toHaveLength(1);
  });
});

describe('changing your password', () => {
  const form = () => screen.getByRole('heading', { name: 'Password' }).closest('form');
  const fill = (current, next, confirmation = next) => {
    fireEvent.change(within(form()).getByLabelText('Current password'), { target: { value: current } });
    fireEvent.change(within(form()).getByLabelText('New password'), { target: { value: next } });
    fireEvent.change(within(form()).getByLabelText('Confirm new password'), { target: { value: confirmation } });
    fireEvent.click(within(form()).getByRole('button', { name: 'Change' }));
  };

  beforeEach(async () => {
    installFakeApi().logIn();
    renderProfile();
    await screen.findByRole('heading', { name: 'Password' });
  });

  it('changes it, keeps you logged in, and says other devices are logged out', async () => {
    fill('password', 'a much longer one');

    expect(await within(form()).findByText('Password changed. Other devices are logged out.')).toBeInTheDocument();
    expect(within(form()).getByLabelText('Current password')).toHaveValue('');
    expect(localStorage.getItem('eventbuddy_token')).toBe('fake-token');
    const [[, sent]] = requests('POST', '/api/auth/password');
    expect(JSON.parse(sent.body)).toEqual({ currentPassword: 'password', newPassword: 'a much longer one' });
    await settle();
  });

  it("shows the server's message for a wrong current password", async () => {
    fill('not-it', 'a much longer one');

    expect(await within(form()).findByRole('alert')).toHaveTextContent("Your current password isn't right.");
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it("shows the server's message for a common password", async () => {
    fill('password', 'password1');

    expect(await within(form()).findByRole('alert')).toHaveTextContent('That password is too common. Please choose another.');
  });

  it('catches a mistyped confirmation without asking the server', async () => {
    fill('password', 'a much longer one', 'a much longer onr');

    expect(within(form()).getByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(requests('POST', '/api/auth/password')).toHaveLength(0);
  });

  it('catches a short password without asking the server', async () => {
    fill('password', 'short');

    expect(within(form()).getByRole('alert')).toHaveTextContent('Password must be at least 8 characters');
    expect(requests('POST', '/api/auth/password')).toHaveLength(0);
  });
});

it("doesn't offer a password change to a demo account, which has none", async () => {
  installFakeApi({ demoAccount: true }).logIn();
  renderProfile();

  await screen.findByRole('heading', { name: 'Get paid' });
  expect(screen.queryByRole('heading', { name: 'Password' })).not.toBeInTheDocument();
});
