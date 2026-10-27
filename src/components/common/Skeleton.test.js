import React from 'react';
import { render, screen } from '@testing-library/react';
import { Skeleton, SkeletonScreen } from './Skeleton';

describe('SkeletonScreen', () => {
  it('announces one labelled status and hides its blocks from assistive tech', () => {
    render(
      <SkeletonScreen label="Loading the schedule">
        <Skeleton className="h-4 w-20" />
      </SkeletonScreen>
    );

    const status = screen.getByRole('status', { name: 'Loading the schedule' });
    // The sentence is text in the region, which is what live regions announce
    expect(status).toHaveTextContent('Loading the schedule');
    const blocks = status.lastChild;
    expect(blocks).toHaveAttribute('aria-hidden', 'true');
    expect(blocks.firstChild).toHaveClass('skeleton', 'h-4', 'w-20');
  });
});
