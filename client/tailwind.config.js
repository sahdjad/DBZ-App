/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Design-System „Deep Forest / Dark Nature"
        bg: '#0B1E14',
        sidebar: '#08150D',
        card: '#142F22',
        moss: '#1C3F2D', // Moos-Rahmen
        hover: '#27543C',
        mint: {
          DEFAULT: '#5DBA8C',
          light: '#86D2AC',
        },
        ivory: '#F6FAF8', // Überschriften
        sage: {
          DEFAULT: '#D1DCD6', // Fließtext
          muted: '#88A192', // gedämpft
        },
        status: {
          present: '#5DBA8C',
          late: '#CBA45A', // Bernstein – verspätet
          incomplete: '#CBA45A',
          excused: '#7CA5C9', // dezentes Blau – entschuldigt
          absent: '#D08770', // Terrakotta – unentschuldigt/abwesend
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        sans: ['"Hanken Grotesk"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        arabic: ['Amiri', '"Noto Naskh Arabic"', '"Geeza Pro"', '"Times New Roman"', 'serif'],
      },
      borderRadius: {
        lg: '0.75rem',
        xl: '1rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s ease forwards',
        'fade-in': 'fade-in 0.8s ease forwards',
      },
    },
  },
  plugins: [],
};
