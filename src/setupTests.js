// Runs before every test file (CRA picks this file up automatically).
// Adds DOM matchers like toBeInTheDocument().
import '@testing-library/jest-dom';

// jsdom doesn't implement layout, so scrollIntoView doesn't exist there
Element.prototype.scrollIntoView = () => {};
