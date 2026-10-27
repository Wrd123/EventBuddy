import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi, settle } from '../../testUtils/fakeApi';
import MainLayout from '../layout/MainLayout';

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

const requests = (method, url) =>
  global.fetch.mock.calls.filter(([u, opts = {}]) => (opts.method || 'GET') === method && u === url);

beforeEach(() => localStorage.clear());

describe('Editing an event', () => {
  beforeEach(() => installFakeApi({ liveEvent: true }).logIn());

  it('lets the organizer change the details and add a description', async () => {
    renderAt('/events/1');
    fireEvent.click(await screen.findByRole('link', { name: 'Edit' }));

    const name = await screen.findByLabelText('Event name');
    expect(name).toHaveValue('Summer Music Festival');
    // It already spans several days, so the end date is there to change
    expect(screen.getByLabelText('End date')).toHaveValue('2027-04-18');

    fireEvent.change(name, { target: { value: 'Coachella Weekend' } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Camping in lot 8. Bring earplugs.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Coachella Weekend' })).toBeInTheDocument();
    expect(screen.getByText('Camping in lot 8. Bring earplugs.')).toBeInTheDocument();
    const [, options] = requests('PATCH', '/api/events/1')[0];
    expect(JSON.parse(options.body)).toMatchObject({
      name: 'Coachella Weekend',
      description: 'Camping in lot 8. Bring earplugs.',
      startDate: '2027-04-15',
      endDate: '2027-04-18'
    });
    await settle();
  });

  it("tells a member who isn't the organizer they can't edit it", async () => {
    // Taylor organizes the picnic; John is a member
    renderAt('/events/5/edit');
    expect(await screen.findByText("Can't edit this event")).toBeInTheDocument();
    expect(screen.getByText('Only the organizer can change this event.')).toBeInTheDocument();
  });

  it('deletes the event after asking', async () => {
    renderAt('/events/2/edit');

    fireEvent.click(await screen.findByRole('button', { name: 'Delete event' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete Hiking Trip?' })).toBeInTheDocument();
    expect(requests('DELETE', '/api/events/2')).toHaveLength(0);

    // The first button has become the confirmation, so there's one again
    fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));

    expect(await screen.findByRole('heading', { name: /Hey John/ })).toBeInTheDocument();
    expect(requests('DELETE', '/api/events/2')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText('Hiking Trip')).not.toBeInTheDocument());
  });

  it('can be talked out of deleting', async () => {
    renderAt('/events/2/edit');

    fireEvent.click(await screen.findByRole('button', { name: 'Delete event' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(requests('DELETE', '/api/events/2')).toHaveLength(0);
  });

  it('offers Edit only to the organizer', async () => {
    // Taylor organizes the picnic; John is a member
    renderAt('/events/5');
    await screen.findByRole('heading', { level: 1, name: 'Picnic in the Park' });
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
