/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        governance: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          900: '#0c4a6e',
        },
        risk: {
          low: '#22c55e',
          medium: '#f59e0b',
          high: '#ef4444',
          critical: '#7c3aed',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
  // Safelist risk colors used dynamically
  safelist: [
    'bg-green-500', 'bg-yellow-500', 'bg-red-500', 'bg-purple-500',
    'text-green-600', 'text-yellow-600', 'text-red-600', 'text-purple-600',
    'border-green-500', 'border-yellow-500', 'border-red-500',
  ],
};
