import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi, settle } from '../../testUtils/fakeApi';
import MainLayout from '../layout/MainLayout';

// Event 1: John (logged in) owes Alex $150. Alex has Venmo, PayPal and
// Zelle set up; John starts with no payment handles.
const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

const openSettleUp = async () => {
  renderAt('/events/1/expenses');
  await screen.findByText('Airbnb');
  return screen.getByRole('heading', { name: 'Settle up' }).closest('section');
};

const memo = encodeURIComponent('EventBuddy · Summer Music Festival');

beforeEach(() => {
  localStorage.clear();
  Object.assign(navigator, { clipboard: { writeText: jest.fn(() => Promise.resolve()) } });
});

describe('paying from Settle up', () => {
  beforeEach(() => installFakeApi().logIn());

  it("offers the recipient's payment apps with the amount filled in", async () => {
    const settle = await openSettleUp();

    const venmo = within(settle).getByRole('link', { name: /with Venmo/ });
    // Tests run as a desktop browser, so Venmo uses its website
    expect(venmo).toHaveAttribute('href', `https://venmo.com/alex-smith?txn=pay&amount=150.00&note=${memo}`);
    expect(venmo).toHaveAccessibleName('Pay Alex $150.00 with Venmo (@alex-smith)');
    expect(within(settle).getByRole('link', { name: /with PayPal/ })).toHaveAttribute('href', 'https://paypal.me/alexs/150.00USD');
    expect(within(settle).queryByRole('link', { name: /Cash App/ })).not.toBeInTheDocument();
    expect(within(settle).getByText("Check it's Alex before you pay.")).toBeInTheDocument();
  });

  it('opens pay links in a new tab', async () => {
    const settle = await openSettleUp();
    const venmo = within(settle).getByRole('link', { name: /with Venmo/ });

    expect(venmo).toHaveAttribute('target', '_blank');
    expect(venmo).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('nudges you to Mark paid after opening a payment app', async () => {
    const settle = await openSettleUp();
    expect(within(settle).queryByText(/Sent it\?/)).not.toBeInTheDocument();

    fireEvent.click(within(settle).getByRole('link', { name: /with Venmo/ }));

    expect(within(settle).getByText("Sent it? Tap Mark paid so everyone's balances update.")).toBeInTheDocument();
  });

  it('shows the Zelle address to copy, with instructions', async () => {
    const settle = await openSettleUp();

    fireEvent.click(within(settle).getByRole('button', { name: 'Zelle' }));
    expect(within(settle).getByText('alex@example.com')).toBeInTheDocument();
    expect(within(settle).getByText(/Open your bank's app, choose Zelle, and send \$150\.00/)).toBeInTheDocument();

    fireEvent.click(within(settle).getByRole('button', { name: 'Copy' }));
    expect(await within(settle).findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('alex@example.com');
  });
});

describe('on a phone', () => {
  const realUserAgent = navigator.userAgent;
  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', configurable: true });
    installFakeApi().logIn();
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: realUserAgent, configurable: true });
  });

  it('opens the Venmo app directly, without a new tab', async () => {
    const settle = await openSettleUp();
    const venmo = within(settle).getByRole('link', { name: /with Venmo/ });

    expect(venmo).toHaveAttribute('href', `venmo://paycharge?txn=pay&recipients=alex-smith&amount=150.00&note=${memo}`);
    expect(venmo).not.toHaveAttribute('target');
  });
});

describe('when the recipient has no payment info', () => {
  it('says so instead of showing buttons', async () => {
    installFakeApi({ handles: { u2: { venmo: '', cashapp: '', paypal: '', zelle: '' } } }).logIn();
    const settle = await openSettleUp();

    expect(within(settle).getByText("Alex hasn't added payment info yet.")).toBeInTheDocument();
    expect(within(settle).queryByRole('link', { name: /Pay Alex/ })).not.toBeInTheDocument();
    // Mark paid still works for payments made some other way
    expect(within(settle).getByRole('button', { name: 'Mark paid' })).toBeInTheDocument();
  });
});

describe('asking for your own payment info', () => {
  const addExpensePaidByMe = async () => {
    // John pays a $400 dinner split with Alex: now Alex owes John $50
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    fireEvent.change(screen.getByLabelText('What was it for'), { target: { value: 'Dinner' } });
    fireEvent.change(screen.getByLabelText('Amount ($)'), { target: { value: '400' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add expense' }));
    await screen.findByText('Dinner');
  };

  it('prompts you when someone owes you and you have no handles', async () => {
    installFakeApi().logIn();
    const settle = await openSettleUp();
    expect(within(settle).queryByRole('link', { name: /Add your Venmo/ })).not.toBeInTheDocument();

    await addExpensePaidByMe();

    const prompt = within(settle).getByRole('link', { name: 'Add your Venmo, Cash App, PayPal or Zelle' });
    expect(prompt).toHaveAttribute('href', '/profile');
  });

  it("doesn't prompt once you have a handle", async () => {
    installFakeApi({ handles: { u1: { venmo: 'john-doe', cashapp: '', paypal: '', zelle: '' } } }).logIn();
    const settle = await openSettleUp();

    await addExpensePaidByMe();

    expect(within(settle).queryByRole('link', { name: /Add your Venmo/ })).not.toBeInTheDocument();
  });
});

describe('Profile: Get paid', () => {
  beforeEach(() => installFakeApi().logIn());

  const openProfile = async () => {
    renderAt('/profile');
    return (await screen.findByRole('heading', { name: 'Get paid' })).closest('form');
  };

  it('saves payment handles', async () => {
    const form = await openProfile();
    const save = within(form).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    fireEvent.change(within(form).getByLabelText('Venmo'), { target: { value: 'john-doe' } });
    fireEvent.change(within(form).getByLabelText('Zelle'), { target: { value: 'john@example.com' } });
    fireEvent.click(save);

    expect(await within(form).findByText('Saved')).toBeInTheDocument();
    expect(within(form).getByLabelText('Venmo')).toHaveValue('john-doe');
    expect(within(form).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it("shows the server's message for an invalid handle", async () => {
    const form = await openProfile();

    fireEvent.change(within(form).getByLabelText('Venmo'), { target: { value: 'abc' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));

    expect(await within(form).findByText('Venmo usernames are 5-30 letters, numbers, dashes or underscores.')).toBeInTheDocument();
  });

  it('explains who can see the handles', async () => {
    const form = await openProfile();
    expect(within(form).getByText(/Only people in your events can see these/)).toBeInTheDocument();
    await settle();
  });
});
