/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: '#101113',
        surface: {
          DEFAULT: '#17191D',
          panel: '#1D2025',
          elevated: '#252930',
          hover: '#2C313A',
          active: '#343A45'
        },
        border: {
          DEFAULT: '#30343B',
          subtle: '#262930',
          strong: '#454B55',
          active: '#58606D'
        },
        accent: {
          lime: '#C7FF4A',
          'lime-hover': '#D6FF70',
          'lime-muted': 'rgba(199, 255, 74, 0.15)',
          cyan: '#62D9E8',
          'cyan-hover': '#82E2EE',
          'cyan-muted': 'rgba(98, 217, 232, 0.15)',
          amber: '#FFB84C',
          rose: '#FF5C5C',
          violet: '#A78BFA'
        },
        text: {
          primary: '#F5F6F7',
          secondary: '#A1A6AF',
          muted: '#6E7480',
          disabled: '#484D56'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
      },
      boxShadow: {
        'panel': '0 4px 20px -2px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04)',
        'elevated': '0 10px 30px -5px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        'glow-lime': '0 0 20px -4px rgba(199, 255, 74, 0.4)',
        'glow-cyan': '0 0 20px -4px rgba(98, 217, 232, 0.4)'
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 12s linear infinite'
      }
    },
  },
  plugins: [],
}
