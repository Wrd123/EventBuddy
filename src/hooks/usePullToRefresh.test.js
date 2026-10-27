import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import usePullToRefresh from './usePullToRefresh';
import * as haptics from '../services/haptics';

jest.mock('../services/haptics', () => ({ tap: jest.fn(), warning: jest.fn(), success: jest.fn() }));

const Harness = ({ onRefresh }) => {
  const { bind, indicator } = usePullToRefresh(onRefresh);
  return (
    <div style={{ position: 'relative' }}>
      {indicator}
      <div ref={bind} data-testid="scroller">
        content
      </div>
    </div>
  );
};

const at = (x, y) => ({ touches: [{ clientX: x, clientY: y }] });

const pull = (el, { dx = 0, dy }) => {
  fireEvent.touchStart(el, at(100, 100));
  fireEvent.touchMove(el, at(100 + dx, 100 + dy));
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 100 + dx, clientY: 100 + dy }] });
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

// This Jest has no async timer advance, so flush promises around each step:
// the hook starts its minimum-spin timer only after the refresh promise settles.
const advance = async (ms) => {
  await act(async () => {});
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await act(async () => {});
};
const settle = () => advance(500);

describe('usePullToRefresh', () => {
  it('does not refresh when the pull stops short', () => {
    const onRefresh = jest.fn();
    render(<Harness onRefresh={onRefresh} />);
    pull(screen.getByTestId('scroller'), { dy: 40 });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
    expect(haptics.tap).not.toHaveBeenCalled();
  });

  it('refreshes once when pulled past the threshold, showing the status until done', async () => {
    const work = deferred();
    const onRefresh = jest.fn(() => work.promise);
    render(<Harness onRefresh={onRefresh} />);
    pull(screen.getByTestId('scroller'), { dy: 160 });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing');

    await act(async () => {
      work.resolve();
    });
    await settle();
    expect(screen.queryByRole('status')).toBeNull();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the spinner for a minimum time even when the refresh is instant', async () => {
    render(<Harness onRefresh={() => Promise.resolve()} />);
    pull(screen.getByTestId('scroller'), { dy: 160 });
    await advance(200);
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing');
    await advance(300);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ignores a pull when the list is scrolled down', () => {
    const onRefresh = jest.fn();
    render(<Harness onRefresh={onRefresh} />);
    const el = screen.getByTestId('scroller');
    Object.defineProperty(el, 'scrollTop', { value: 30, configurable: true });
    pull(el, { dy: 160 });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('leaves horizontal swipes alone', () => {
    const onRefresh = jest.fn();
    render(<Harness onRefresh={onRefresh} />);
    pull(screen.getByTestId('scroller'), { dx: 200, dy: 40 });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('leaves an upward drag alone', () => {
    const onRefresh = jest.fn();
    render(<Harness onRefresh={onRefresh} />);
    pull(screen.getByTestId('scroller'), { dy: -160 });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('shows a friendly message when the refresh fails, then clears it', async () => {
    render(<Harness onRefresh={() => Promise.reject(new Error('offline'))} />);
    pull(screen.getByTestId('scroller'), { dy: 160 });
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't refresh. Check your connection.");
    expect(haptics.warning).toHaveBeenCalledTimes(1);

    await advance(2600);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ignores a second pull while a refresh is running', async () => {
    const work = deferred();
    const onRefresh = jest.fn(() => work.promise);
    render(<Harness onRefresh={onRefresh} />);
    const el = screen.getByTestId('scroller');
    pull(el, { dy: 160 });
    pull(el, { dy: 160 });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      work.resolve();
    });
    await settle();
  });

  it('taps once as the pull crosses the threshold', () => {
    render(<Harness onRefresh={() => Promise.resolve()} />);
    const el = screen.getByTestId('scroller');
    fireEvent.touchStart(el, at(100, 100));
    fireEvent.touchMove(el, at(100, 150));
    expect(haptics.tap).not.toHaveBeenCalled();
    fireEvent.touchMove(el, at(100, 260));
    fireEvent.touchMove(el, at(100, 300));
    expect(haptics.tap).toHaveBeenCalledTimes(1);
  });

  it('moves the content with the finger and puts it back after a short pull', () => {
    render(<Harness onRefresh={jest.fn()} />);
    const el = screen.getByTestId('scroller');
    fireEvent.touchStart(el, at(100, 100));
    fireEvent.touchMove(el, at(100, 140));
    expect(el.style.transform).toMatch(/translateY\(/);
    fireEvent.touchEnd(el);
    expect(el.style.transform).toBe('');
  });

  it('uses the latest onRefresh', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = render(<Harness onRefresh={first} />);
    rerender(<Harness onRefresh={second} />);
    pull(screen.getByTestId('scroller'), { dy: 160 });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does nothing after unmount', async () => {
    const work = deferred();
    const { unmount } = render(<Harness onRefresh={() => work.promise} />);
    pull(screen.getByTestId('scroller'), { dy: 160 });
    unmount();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      work.reject(new Error('late'));
    });
    await settle();
    expect(error).not.toHaveBeenCalled();
    expect(haptics.warning).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
