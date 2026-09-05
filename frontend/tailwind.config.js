/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#16a34a',
          dark: '#15803d',
          light: '#22c55e',
          50: '#f0fdf4',
        },
        secondary: '#2563eb',
        danger: '#ef4444',
        warning: '#f59e0b',
        // Theme-aware surface/text/border tokens. Values are CSS custom
        // properties that flip automatically when the `.dark` class is
        // present on <html> (see index.css) - this lets every page use
        // ordinary Tailwind classes (bg-app-card, text-app-body, etc.)
        // that adapt to light/dark theme without per-page conditional
        // classes.
        surface: 'var(--color-bg-page)',
        'app-card': 'var(--color-bg-card)',
        'app-alt': 'var(--color-bg-alt)',
        'app-hover': 'var(--color-bg-hover)',
        'app-hover-strong': 'var(--color-bg-hover-strong)',
        'app-heading': 'var(--color-text-heading)',
        'app-body': 'var(--color-text-body)',
        'app-muted': 'var(--color-text-muted)',
        'app-faint': 'var(--color-text-faint)',
        'app-border': 'var(--color-border)',
        'app-border-input': 'var(--color-border-input)',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)',
      },
      borderRadius: {
        card: '12px',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-16px)' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
