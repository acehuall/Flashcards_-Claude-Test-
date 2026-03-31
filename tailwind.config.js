/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg:         'rgb(var(--app-bg) / <alpha-value>)',
          'bg-alt':   'rgb(var(--app-bg-alt) / <alpha-value>)',
          'card-q':   'rgb(var(--app-card-q) / <alpha-value>)',
          'card-a':   'rgb(var(--app-card-a) / <alpha-value>)',
          primary:    'rgb(var(--app-primary) / <alpha-value>)',
          secondary:  'rgb(var(--app-secondary) / <alpha-value>)',
          correct:    'rgb(var(--app-correct) / <alpha-value>)',
          incorrect:  'rgb(var(--app-incorrect) / <alpha-value>)',
          flag:       'rgb(var(--app-flag) / <alpha-value>)',
          nav:        'rgb(var(--app-nav) / <alpha-value>)',
          'nav-dark': 'rgb(var(--app-nav-dark) / <alpha-value>)',
          surface:    'rgb(var(--app-surface) / <alpha-value>)',
          border:     'rgb(var(--app-border) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Roboto', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
        pill: '9999px',
      },
      keyframes: {
        'flip-in': {
          '0%':   { transform: 'rotateY(90deg)', opacity: '0' },
          '100%': { transform: 'rotateY(0deg)',  opacity: '1' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',   opacity: '1' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'toast-in': {
          '0%':   { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
      },
      animation: {
        'flip-in':  'flip-in 0.25s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
        'fade-in':  'fade-in 0.15s ease-out',
        'toast-in': 'toast-in 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
