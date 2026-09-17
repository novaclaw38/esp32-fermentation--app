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
        // The instrument-panel ground. Warm-tinted charcoal, never pure
        // black -- a real panel's material has a temperature, and this one
        // shares its undertone with `brew` rather than going cold/blue.
        panel: {
          950: "#14110e", // page background
          900: "#1c1712", // tile / card surface
          800: "#262019", // raised bezel, hover surface
          700: "#332a20", // border / divider on dark
          600: "#453829", // lighter edge, focus-adjacent highlight
          400: "#8a7a63", // secondary text on dark -- tinted, never gray
          200: "#d9cbb0", // primary text on dark
        },
        // Explicit gauge-state hues, named for role rather than left as bare
        // Tailwind reds/oranges scattered through component code. `nominal`
        // intentionally reuses `brew` (the glow is the same amber, just lit)
        // rather than introducing a fourth hue family.
        approach: {
          400: "#fb923c",
          500: "#f2751a",
        },
        breach: {
          400: "#f87171",
          500: "#ef4444",
        },
      },
      fontFamily: {
        // Tabular readouts only -- every live numeral on a gauge. Kept as a
        // system stack, matching the rest of the app: no webfont import, so
        // nothing new to load on a weak connection.
        gauge: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
