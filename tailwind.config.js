/** @type {import('tailwindcss').Config} */
// EventBuddy's night theme. Screens use these names (bg-night, bg-surface,
// text-fg, text-muted, border-line, violet...) rather than raw grays, so
// the look stays consistent and can be adjusted in one place.
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#0c0a1f',      // app background
        surface: '#16132f',    // cards and sheets
        raised: '#211d45',     // inputs, chips, nested blocks
        line: 'rgba(167, 139, 250, 0.16)', // hairline borders on dark
        fg: '#f4f2ff',         // primary text
        muted: '#a29fc4',      // secondary text
        faint: '#6f6b96',      // placeholders, disabled
        violet: {
          DEFAULT: '#8b5cf6',
          soft: '#a78bfa',
          deep: '#6d28d9',
        },
        go: '#4ade80',         // positive / "on" states
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        // The violet halo behind primary actions and the + button
        glow: '0 0 24px rgba(139, 92, 246, 0.55)',
        'glow-sm': '0 0 14px rgba(139, 92, 246, 0.35)',
      },
      borderRadius: {
        card: '1.25rem',
      },
    },
  },
  plugins: [],
};
