/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brew: {
          50: "#fdf7ed",
          100: "#f8e9cc",
          200: "#f0d094",
          300: "#e6b25c",
          400: "#dd9834",
          500: "#c97f22",
          600: "#a8631c",
          700: "#84491a",
          800: "#6c3c1b",
          900: "#5b331a",
        },
      },
    },
  },
  plugins: [],
};
