/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        teal: {
          dark: '#0D4F5C',
          DEFAULT: '#1B6B7A',
          mid: '#2A8A9A',
          light: '#4FB8C8',
        },
        cyan: {
          brand: '#00C2CB',
        },
        amber: {
          brand: '#F5C842',
        },
        ink: '#1A1A2E',
        surface: '#F5F9FA',
        card: '#FFFFFF',
      },
      fontFamily: {
        sans: ['Montserrat_400Regular'],
        medium: ['Montserrat_500Medium'],
        semibold: ['Montserrat_600SemiBold'],
        bold: ['Montserrat_700Bold'],
      },
    },
  },
  plugins: [],
};
