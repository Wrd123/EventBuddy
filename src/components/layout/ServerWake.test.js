import React from 'react';
import { render, screen, act } from '@testing-library/react';
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

  it("doesn't invent progress, and offers something to read on a long wait", async () => {
    jest.useFakeTimers();
    try {
      global.fetch = jest.fn(unreachable);
      renderWake();
      act(() => { jest.advanceTimersByTime(30); });
      expect(screen.getByText('Waking up the demo')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Read about EventBuddy while you wait' })).not.toBeInTheDocument();

      act(() => { jest.advanceTimersByTime(91000); });

      expect(screen.getByText(/Taking longer than usual/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Read about EventBuddy while you wait' }))
        .toHaveAttribute('href', 'https://github.com/Wrd123/EventBuddy#readme');
      // The bar is a sliding segment with no width of its own to grow
      expect(document.querySelector('.wake-bar').getAttribute('style')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('is off unless the build turns it on', () => {
    global.fetch = jest.fn(unreachable);
    render(<ServerWake><p>The app</p></ServerWake>);

    expect(screen.getByText('The app')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
