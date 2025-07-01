/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          'governance-blue': '#2563eb',
          'compliance-green': '#16a34a',
          'audit-purple': '#9333ea',
          'ethics-orange': '#ea580c',
          'privacy-red': '#dc2626',
        },
        animation: {
          'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          'bounce-subtle': 'bounce 2s infinite',
        }
      },
    },
    plugins: [],
  }