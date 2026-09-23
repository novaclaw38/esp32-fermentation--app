import type { Config } from "tailwindcss";
import { fontGauge, palette } from "./src/lib/tokens";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Colors live in src/lib/tokens.ts so SVG and chart code can share them.
      colors: palette,
      fontFamily: {
        // Tabular readouts only -- every live numeral on a gauge. A system
        // stack, matching the rest of the app: no webfont to load on a weak
        // connection.
        gauge: fontGauge,
      },
    },
  },
  plugins: [],
} satisfies Config;
