/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          // Primary color with shades
          'purple': {
            50: '#f5f3ff',
            100: '#ede9fe',
            200: '#ddd6fe',
            300: '#c4b5fd',
            400: '#a78bfa',
            500: '#8b5cf6',
            600: '#7c3aed', // Primary purple color
            700: '#6d28d9',
            800: '#5b21b6',
            900: '#4c1d95',
          },
        },
        fontFamily: {
          sans: [
            'Inter',
            'ui-sans-serif',
            'system-ui',
            '-apple-system',
            'BlinkMacSystemFont',
            '"Segoe UI"',
            'Roboto',
            '"Helvetica Neue"',
            'Arial',
            'sans-serif',
          ],
        },
        boxShadow: {
          'soft': '0 2px 10px rgba(0, 0, 0, 0.05)',
        },
        height: {
          'screen-minus-nav': 'calc(100vh - 64px)',
        },
      },
    },
    plugins: [],
  }