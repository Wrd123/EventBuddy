import React from 'react';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import PhotoBackdrop from './PhotoBackdrop';

// jsdom can't apply media queries, so this checks the rule itself is there
const css = fs.readFileSync(path.join(__dirname, '../../styles/index.css'), 'utf8');
// The body of the Reduce Transparency block, up to the next top-level rule
const reduceTransparency = css.slice(css.indexOf('@media (prefers-reduced-transparency: reduce)')).split(/\n}\n/)[0];

describe('PhotoBackdrop', () => {
  it('hides the blurred photo when Reduce Transparency is on', () => {
    const { container } = render(<PhotoBackdrop event={{ _id: '1', name: 'Picnic' }} />);

    expect(container.querySelector('img')).toHaveClass('photo-backdrop');
    expect(reduceTransparency).toMatch(/\.photo-backdrop\s*{\s*display: none;/);
  });
});
