/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Design-System „Ivory / Deep Forest" – weiß mit dunkelgrünen Akzenten (DBZ-Logo)
        bg: '#F4F8F5', // Seitenhintergrund (sanftes Weiß)
        sidebar: '#FFFFFF', // Navigations-/Kartenweiß & Kontrasttext auf Grün
        card: '#FFFFFF', // Karten & Eingabefelder
        moss: '#DCE7E1', // helle Rahmen
        hover: '#E7F1EB', // sanftes Grün beim Überfahren
        mint: {
          DEFAULT: '#15653F', // Dunkelgrün (Akzent, Buttons, Links) – wie DBZ-Logo
          light: '#1E8A56',
        },
        ivory: '#0F2A1E', // Überschriften (sehr dunkles Grün)
        sage: {
          DEFAULT: '#39493F', // Fließtext
          muted: '#68786E', // gedämpft
        },
        status: {
          present: '#1E8A56',
          late: '#A9781A', // Bernstein – verspätet
          incomplete: '#A9781A',
          excused: '#3C6B9E', // dezentes Blau – entschuldigt
          absent: '#BC5238', // Terrakotta – unentschuldigt/abwesend
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
