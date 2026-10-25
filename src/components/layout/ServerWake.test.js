import React from 'react';
import { render, screen } from '@testing-library/react';
import ServerWake from './ServerWake';

const healthy = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 'ok', demo: true }) });
const unreachable = () => Promise.reject(new TypeError('Failed to fetch'));

const renderWake = (props) =>
  render(
    <ServerWake enabled showAfterMs={20} retryMs={20} {...props}>
      <p>The app</p>
    </ServerWake>
  );

describe('ServerWake', () => {
  it('goes straight to the app when the server answers', async () => {
    global.fetch = jest.fn(healthy);
    renderWake();

    expect(await screen.findByText('The app')).toBeInTheDocument();
    expect(screen.queryByText('Waking up the demo')).not.toBeInTheDocument();
  });

  it('explains the wait while the server starts, then opens the app', async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(unreachable)
      .mockImplementationOnce(unreachable)
      .mockImplementation(healthy);
    renderWake({ retryMs: 60 });

    expect(await screen.findByText('Waking up the demo')).toBeInTheDocument();
    expect(await screen.findByText('The app')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('is off unless the build turns it on', () => {
    global.fetch = jest.fn(unreachable);
    render(<ServerWake><p>The app</p></ServerWake>);

    expect(screen.getByText('The app')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
