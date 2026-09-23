/**
 * The one source of every color in the dashboard. tailwind.config.ts builds
 * its theme from this, and the places Tailwind classes can't reach -- SVG
 * attributes in Gauge, Recharts props -- import it directly. Before this, the
 * same hex values were typed out by hand in about forty places, which is how
 * the gravity series picked up a green the palette never had.
 */
export const palette = {
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
  // The instrument-panel ground. Warm-tinted charcoal, never pure black -- a
  // real panel's material has a temperature, and this one shares its
  // undertone with `brew` rather than going cold/blue.
  panel: {
    950: "#14110e", // page background
    900: "#1c1712", // tile / card surface
    800: "#262019", // raised bezel, hover surface
    700: "#332a20", // border / divider on dark -- never text (1.26:1)
    600: "#453829", // lighter edge, chart axis -- never text
    // Gauge track and skeleton dial. Chosen to clear WCAG's 3:1 non-text
    // floor against both panel-900 and panel-950; panel-700 doesn't.
    500: "#7a654c",
    // Secondary text: ~5.3:1 on panel-900, ~5.6:1 on panel-950.
    400: "#9c8a6e",
    200: "#d9cbb0", // primary text
  },
  // Gauge-state hues, named for role. `nominal` reuses brew.
  approach: {
    400: "#fb923c",
    500: "#f2751a",
  },
  breach: {
    400: "#f87171",
    500: "#ef4444",
    // Fill for solid destructive buttons. breach-500 under white text holds
    // only 3.76:1; this holds 6.5:1 with white.
    700: "#b91c1c",
  },
  // Gravity series. The one data hue that isn't a state: it has to read as
  // "a different quantity" beside the amber temperature line, not as a
  // warning. 10.2:1 on panel-900.
  gravity: {
    400: "#4ade80",
  },
} as const;

export const fontGauge = ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "monospace"];

/** Shared Recharts styling -- every chart on the detail page reads the same. */
export const chartTheme = {
  grid: palette.panel[800],
  axis: palette.panel[600],
  tick: { fontSize: 11, fill: palette.panel[400] },
  tooltip: {
    contentStyle: { background: palette.panel[900], border: `1px solid ${palette.panel[700]}`, borderRadius: 6 },
    labelStyle: { color: palette.panel[200] },
  },
  threshold: palette.breach[400],
  temperature: palette.brew[400],
  gravity: palette.gravity[400],
} as const;
