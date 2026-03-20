/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg:         '#1A1C1E',
          'bg-alt':   '#141414',
          'card-q':   '#303030',
          'card-a':   '#1E2124',
          primary:    '#FFFFFF',
          secondary:  '#909090',
          correct:    '#4CAF50',
          incorrect:  '#F44336',
          flag:       '#FFC107',
          nav:        '#3F51B5',
          'nav-dark': '#303F9F',
          surface:    '#252729',
          border:     '#2E3135',
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
