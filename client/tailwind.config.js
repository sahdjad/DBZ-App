/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Themefähig über CSS-Variablen (siehe index.css :root & .dark).
        // Hell = „Ivory / Deep Forest"; Dunkel = augenschonendes, warmes Dunkelgrün.
        bg: 'rgb(var(--c-bg) / <alpha-value>)', // Seitenhintergrund
        sidebar: 'rgb(var(--c-sidebar) / <alpha-value>)', // Navigations-/Panel-Fläche
        card: 'rgb(var(--c-card) / <alpha-value>)', // Karten & Eingabefelder
        moss: 'rgb(var(--c-moss) / <alpha-value>)',
        hover: 'rgb(var(--c-hover) / <alpha-value>)', // sanftes Überfahren
        line: 'rgb(var(--c-line) / <alpha-value>)', // Rahmen & Trenner (themefähig)
        subtle: 'rgb(var(--c-subtle) / <alpha-value>)', // dezente Flächen/Fills
        onaccent: 'rgb(var(--c-onaccent) / <alpha-value>)', // Text auf Grün (immer hell)
        mint: {
          DEFAULT: 'rgb(var(--c-mint) / <alpha-value>)', // Akzent (DBZ-Grün)
          light: 'rgb(var(--c-mint-light) / <alpha-value>)',
        },
        ivory: 'rgb(var(--c-ivory) / <alpha-value>)', // Überschriften
        sage: {
          DEFAULT: 'rgb(var(--c-sage) / <alpha-value>)', // Fließtext
          muted: 'rgb(var(--c-sage-muted) / <alpha-value>)',
        },
        status: {
          present: 'rgb(var(--c-present) / <alpha-value>)',
          late: 'rgb(var(--c-late) / <alpha-value>)',
          incomplete: 'rgb(var(--c-late) / <alpha-value>)',
          excused: 'rgb(var(--c-excused) / <alpha-value>)',
          absent: 'rgb(var(--c-absent) / <alpha-value>)',
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
