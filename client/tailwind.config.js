/** @type {import('tailwindcss').Config} */
export default {
  // Hover-Effekte nur auf Geräten mit Maus/Trackpad (nicht auf Touch hängen bleiben)
  future: { hoverOnlyWhenSupported: true },
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Themefähig über CSS-Variablen (siehe index.css :root & .dark).
        // Hell = „Ivory / Deep Forest"; Dunkel = augenschonendes, warmes Dunkelgrün.
        bg: 'rgb(var(--c-bg) / <alpha-value>)', // Seitenhintergrund
        sidebar: 'rgb(var(--c-sidebar) / <alpha-value>)', // Navigations-/Panel-Fläche
        card: 'rgb(var(--c-card) / <alpha-value>)', // Karten & Eingabefelder
        elevated: 'rgb(var(--c-elevated) / <alpha-value>)', // Sheets, Popover
        info: 'rgb(var(--c-info) / <alpha-value>)',
        moss: 'rgb(var(--c-moss) / <alpha-value>)',
        hover: 'rgb(var(--c-hover) / <alpha-value>)', // sanftes Überfahren
        line: 'rgb(var(--c-line) / <alpha-value>)', // Rahmen & Trenner (themefähig)
        subtle: 'rgb(var(--c-subtle) / <alpha-value>)', // dezente Flächen/Fills
        onaccent: 'rgb(var(--c-onaccent) / <alpha-value>)', // Text auf Grün (immer hell)
        mint: {
          DEFAULT: 'rgb(var(--c-mint) / <alpha-value>)', // Akzent (DBZ-Grün)
          light: 'rgb(var(--c-mint-light) / <alpha-value>)',
        },
        gold: 'rgb(var(--c-gold) / <alpha-value>)', // Champagner-Gold-Akzent (DEEN)
        ivory: 'rgb(var(--c-ivory) / <alpha-value>)', // Überschriften
        sage: {
          DEFAULT: 'rgb(var(--c-sage) / <alpha-value>)', // Fließtext
          muted: 'rgb(var(--c-sage-muted) / <alpha-value>)',
        },
        status: {
          present: 'rgb(var(--c-present) / <alpha-value>)',
          late: 'rgb(var(--c-late) / <alpha-value>)',
          incomplete: 'rgb(var(--c-late) / <alpha-value>)',
          partial: 'rgb(var(--c-partial) / <alpha-value>)', // Hausaufgaben: weniger als die Hälfte abgegeben (orange)
          excused: 'rgb(var(--c-excused) / <alpha-value>)',
          absent: 'rgb(var(--c-absent) / <alpha-value>)',
        },
      },
      fontFamily: {
        // Eine Familie für alles (Apple-Systemschrift, vom Nutzer umstellbar).
        // „display“ und „mono“ bleiben als Namen bestehen, zeigen aber auf die
        // UI-Schrift (Zahlen dann mit tabular-nums, siehe index.css).
        display: ['var(--font-ui)'],
        sans: ['var(--font-ui)'],
        mono: ['var(--font-ui)'],
        code: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        serif: ['ui-serif', '"New York"', '"Iowan Old Style"', 'Georgia', 'serif'],
        arabic: ['"Uthmanic Hafs"', '"Amiri Quran"', 'Amiri', '"Noto Naskh Arabic"', '"Geeza Pro"', '"Times New Roman"', 'serif'],
        'arabic-ui': ['"Geeza Pro"', '"Noto Naskh Arabic"', '"Noto Sans Arabic"', '"Segoe UI"', 'Tahoma', 'serif'],
        mushaf: ['"Uthmanic Hafs"', '"Amiri Quran"', 'Amiri', '"Noto Naskh Arabic"', '"Geeza Pro"', 'serif'],
      },
      borderRadius: {
        md: '0.5rem',
        lg: '0.625rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.375rem',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        float: 'var(--shadow-float)',
      },
      fontSize: {
        // iOS-angelehnte Skala (rem -> wächst mit der Textgröße-Einstellung)
        caption: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.005em' }],
        footnote: ['0.8125rem', { lineHeight: '1.125rem' }],
        subhead: ['0.9375rem', { lineHeight: '1.3rem' }],
        body: ['1rem', { lineHeight: '1.45rem' }],
        title3: ['1.25rem', { lineHeight: '1.6rem', letterSpacing: '-0.01em' }],
        title2: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em' }],
        title1: ['1.75rem', { lineHeight: '2.1rem', letterSpacing: '-0.02em' }],
        large: ['2rem', { lineHeight: '2.4rem', letterSpacing: '-0.022em' }],
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
