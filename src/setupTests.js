// Runs before every test file (CRA picks this file up automatically).
// Adds DOM matchers like toBeInTheDocument().
import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// jsdom doesn't implement layout, so scrollIntoView doesn't exist there
Element.prototype.scrollIntoView = () => {};

// React Router 7 encodes text, which the jsdom in CRA's Jest predates;
// browsers and Node have it, so tests borrow Node's
Object.assign(global, { TextEncoder, TextDecoder });
