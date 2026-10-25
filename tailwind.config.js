/** @type {import('tailwindcss').Config} */
// EventBuddy's Afterglow theme: a deep plum night lit by each event's photo,
// frosted glass on top, and one warm sunset accent. Screens use these names
// (bg-night, text-fg, text-muted, border-line, accent...) rather than raw
// colors, so the look stays consistent and can be adjusted in one place.
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#120e1c',      // app background, under the photo glow
        surface: '#1d1829',    // solid sheets and panels
        raised: '#2a2438',     // inputs and nested blocks
        line: 'rgba(255, 255, 255, 0.14)', // hairline borders on glass
        fg: '#f8f6fb',         // primary text, and the solid white buttons
        muted: '#b6b0c4',      // secondary text
        faint: '#8a839b',      // placeholders, disabled
        // The sunset accent. Text on an accent fill is night, not white:
        // white on coral is too faint to read.
        accent: {
          DEFAULT: '#ff8f5e',
          soft: '#ffc8a2',     // accent text on dark: dates, links
          deep: '#e86a3a',
        },
        go: '#4ade80',         // live / "on" states
      },
      fontFamily: {
        sans: [
          'Geist',
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
        // The warm halo behind highlighted actions
        glow: '0 0 24px rgba(255, 143, 94, 0.45)',
        'glow-sm': '0 0 14px rgba(255, 143, 94, 0.3)',
        // Lift for floating glass: the tab bar, sheets, hero cards
        float: '0 18px 40px rgba(0, 0, 0, 0.45)',
      },
      borderRadius: {
        card: '1.375rem',
      },
    },
  },
  plugins: [],
};
