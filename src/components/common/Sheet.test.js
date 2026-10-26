import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Sheet, { SheetHostProvider, useSheet } from './Sheet';

// jsdom has no PointerEvent, so a MouseEvent with a pointer event's name
// stands in. timeStamp is faked because the sheet reads speed from it.
const pointer = (target, type, clientY, timeStamp) => {
  const event = new MouseEvent(type, { bubbles: true, clientY });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  act(() => { target.dispatchEvent(event); });
};

const Demo = ({ onClose = () => {}, withHost = false, children }) => {
  const [open, setOpen] = useState(true);
  const sheet = open && (
    <Sheet title="Pick one" onClose={() => { setOpen(false); onClose(); }}>
      <button>First</button>
      <button>Second</button>
      {children}
    </Sheet>
  );
  const page = (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {sheet}
    </>
  );
  return withHost ? <SheetHostProvider>{page}</SheetHostProvider> : page;
};

// Opens from a real click, so there is a trigger to return focus to
const renderClosed = (props) => {
  render(<Demo {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  const trigger = screen.getByRole('button', { name: 'Open' });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
};

describe('Sheet', () => {
  it('is a modal dialog labelled by its title', () => {
    render(<Demo />);
    const dialog = screen.getByRole('dialog', { name: 'Pick one' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { level: 2, name: 'Pick one' })).toBeInTheDocument();
  });

  it('focuses the dialog on open and gives focus back to the trigger on close', () => {
    const trigger = renderClosed();
    expect(screen.getByRole('dialog')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('focuses initialFocus when given', () => {
    const ref = React.createRef();
    render(<Sheet title="T" onClose={() => {}} initialFocus={ref}><input ref={ref} aria-label="Name" /></Sheet>);
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the sheet', () => {
    render(<Demo />);
    const close = screen.getByRole('button', { name: 'Close' });
    const second = screen.getByRole('button', { name: 'Second' });
    second.focus();
    fireEvent.keyDown(second, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(second).toHaveFocus();
  });

  it('closes on Escape', () => {
    const onClose = jest.fn();
    render(<Demo onClose={onClose} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the scrim is tapped but not when the sheet is', () => {
    const onClose = jest.fn();
    render(<Demo onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog.parentElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lets content close it through useSheet', () => {
    const Inner = () => <button onClick={useSheet().close}>Done</button>;
    const onClose = jest.fn();
    render(<Sheet title="T" onClose={onClose}><Inner /></Sheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('plays the exit animation before calling onClose when motion is allowed', () => {
    const original = window.matchMedia;
    window.matchMedia = () => ({ matches: false });
    try {
      const onClose = jest.fn();
      render(<Sheet title="T" onClose={onClose}>body</Sheet>);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.animationEnd(screen.getByRole('dialog'));
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      window.matchMedia = original;
    }
  });

  it('closes after a timeout if animationend never fires', () => {
    jest.useFakeTimers();
    const original = window.matchMedia;
    window.matchMedia = () => ({ matches: false });
    try {
      const onClose = jest.fn();
      render(<Sheet title="T" onClose={onClose}>body</Sheet>);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      act(() => { jest.advanceTimersByTime(1000); });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      window.matchMedia = original;
      jest.useRealTimers();
    }
  });

  it('renders in the host and makes the screen inert while open', () => {
    const { container } = render(<Demo withHost />);
    const screenArea = container.firstChild;
    expect(screenArea.inert).toBe(true);
    // Portaled out of the screen, into the host after it
    expect(screenArea).not.toContainElement(screen.getByRole('dialog'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screenArea.inert).toBe(false);
  });

  it('keeps the screen inert until the last of two stacked sheets closes', () => {
    const Stack = () => {
      const [a, setA] = useState(true);
      const [b, setB] = useState(true);
      return (
        <SheetHostProvider>
          {a && <Sheet title="A" onClose={() => setA(false)}>a</Sheet>}
          {b && <Sheet title="B" onClose={() => setB(false)}>b</Sheet>}
        </SheetHostProvider>
      );
    };
    const { container } = render(<Stack />);
    const screenArea = container.firstChild;
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[1]);
    expect(screenArea.inert).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screenArea.inert).toBe(false);
  });

  describe('dragging', () => {
    const setup = () => {
      const onClose = jest.fn();
      render(<Sheet title="T" onClose={onClose}>body</Sheet>);
      const dialog = screen.getByRole('dialog');
      Object.defineProperty(dialog, 'offsetHeight', { value: 400 });
      return { onClose, dialog, handle: screen.getByRole('heading', { name: 'T' }) };
    };

    it('closes when dragged past a third of its height', () => {
      const { onClose, dialog, handle } = setup();
      pointer(handle, 'pointerdown', 0, 1);
      pointer(handle, 'pointermove', 100, 400);
      pointer(handle, 'pointermove', 160, 800);
      expect(dialog.style.transform).toBe('translateY(160px)');
      pointer(handle, 'pointerup', 160, 810);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on a fast flick even when short', () => {
      const { onClose, handle } = setup();
      pointer(handle, 'pointerdown', 0, 1);
      pointer(handle, 'pointermove', 40, 20);
      pointer(handle, 'pointerup', 40, 25);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('snaps back from a short, slow drag', () => {
      const { onClose, dialog, handle } = setup();
      pointer(handle, 'pointerdown', 0, 1);
      pointer(handle, 'pointermove', 50, 1000);
      pointer(handle, 'pointerup', 50, 1010);
      expect(onClose).not.toHaveBeenCalled();
      expect(dialog.style.transform).toBe('');
      expect(dialog.style.transition).toContain('200ms');
    });

    it('resists being dragged up', () => {
      const { dialog, handle } = setup();
      pointer(handle, 'pointerdown', 100, 1);
      pointer(handle, 'pointermove', 0, 500);
      expect(dialog.style.transform).toBe('translateY(-20px)');
    });

    it('does not start a drag from the sheet body', () => {
      const { onClose, dialog } = setup();
      const body = screen.getByText('body');
      pointer(body, 'pointerdown', 0, 1);
      pointer(body, 'pointermove', 300, 500);
      pointer(body, 'pointerup', 300, 510);
      expect(dialog.style.transform).toBe('');
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
