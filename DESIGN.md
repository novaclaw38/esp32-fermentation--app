---
name: Fermentation Monitor Dashboard
description: A dark instrument panel that reads gravity and temperature at a glance, the way a real gauge cluster does.
colors:
  panel-page: "#14110e"
  panel-surface: "#1c1712"
  panel-raised: "#262019"
  panel-border: "#332a20"
  panel-edge: "#453829"
  panel-text-secondary: "#9c8a6e"
  panel-text-primary: "#d9cbb0"
  brew-glow: "#dd9834"
  brew-accent: "#c97f22"
  brew-accent-hover: "#a8631c"
  approach: "#fb923c"
  approach-deep: "#f2751a"
  breach: "#f87171"
  breach-deep: "#ef4444"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "1.3"
    letterSpacing: "0.025em"
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.4"
    letterSpacing: "0.05em"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: "1.2"
    letterSpacing: "0.1em"
  numeral:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.1"
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.brew-accent}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.brew-accent-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.panel-text-primary}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
    typography: "{typography.body}"
  button-secondary-hover:
    backgroundColor: "{colors.panel-raised}"
  card:
    backgroundColor: "{colors.panel-surface}"
    textColor: "{colors.panel-text-primary}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.panel-page}"
    textColor: "{colors.panel-text-primary}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  chip:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.brew-glow}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
    typography: "{typography.label}"
---

# Design System: Fermentation Monitor Dashboard

## Overview

**Creative North Star: "The Instrument Panel"**

The dashboard reads like a real gauge cluster mounted over the fermenter, not a status page pretending to be one. Every device is a radial instrument with a needle, a tick-marked dial, and a tabular numeral at its center — never a card holding a bare number and a colored badge. The ground is a warm charcoal (never pure black) so the panel has a material temperature, and the one recurring accent — amber phosphor glow — lights up nominal readings the way an analog gauge's face would, then shifts to orange and red as a reading approaches or breaches its threshold. This is a code-led build: there was no comp to defer to, so this system is read directly off the shipped dashboard and its two captured viewports, not off intent.

The system stays deliberately quiet everywhere it isn't the gauge. Cards, buttons, and forms are flat 1px-bordered panels with no shadow vocabulary of their own; the only glow in the interface is the state signal on a needle, a dial center, or an unacknowledged alert dot. Nothing decorative competes with that signal.

**Key Characteristics:**
- Warm dark charcoal panel ground, never cold or pure black
- One state vocabulary — nominal / approaching / breached / offline — expressed as glow color *and* glow intensity, reused identically everywhere a reading appears
- Tabular monospace numerals on every live digit; uppercase tracked labels beneath them
- Flat, unshadowed containers; glow is a state signal, not ambient depth
- Focus-dim: bringing one instrument forward dims its neighbors instead of a badge or modal calling it out

## Colors

A single warm charcoal scale carries the whole interface; amber is the one recurring accent, doubling as both the brand color and the "nominal" gauge glow.

### Primary
- **Brew Amber** (`#dd9834` glow / `#c97f22` solid accent): the nominal-state glow on gauge needles and dial centers, and the solid accent for primary actions (Claim device, Create device) and focus rings. The same hue lit (glow) vs. flat (button fill) rather than two different ambers.

### Secondary — gauge state hues
- **Approach Orange** (`#fb923c` / deep `#f2751a`): a reading nearing its threshold — the "approaching" state, with no equivalent in the alert backend; it exists only so the panel can warn before a value actually leaves range.
- **Breach Red** (`#f87171` / deep `#ef4444`): an open alert or an out-of-range reading. Reserved exclusively for this state — never used decoratively.

### Neutral — the panel scale
- **Panel Ground** (`#14110e`): page background.
- **Panel Surface** (`#1c1712`): tile, card, and form background.
- **Panel Raised** (`#262019`): hover surface and badge/chip background.
- **Panel Border** (`#332a20`): default 1px border, divider, gauge track.
- **Panel Edge** (`#453829`): lighter edge — tick marks, focus-adjacent highlight. Border/edge role only; an audit pass found it in use as real body text (alert timestamps, gauge freshness labels, form hints) at ~1.6:1 contrast, far below WCAG's 3:1 floor for any text size. Corrected to Panel Text Secondary wherever it was carrying text.
- **Panel Text Secondary** (`#9c8a6e`): secondary text and the offline-state glow color — tinted warm, never plain gray. Lightened from the original `#8a7a63` (4.65:1 on the page background, but only 4.27:1 on the `panel-900` card surface most of this text actually sits against, failing AA there) to hold ≥5.3:1 against every surface it's used on.
- **Panel Text Primary** (`#d9cbb0`): primary text on dark.

### Named Rules
**The Glow-Carries-State Rule.** A gauge's state is never color alone. Nominal, approaching, breached, and offline each pair a hue with a distinct glow radius (3px / 5px / 9px / none) so severity reads as intensity before hue even registers — the alert-brightness raise. Don't reintroduce state as a separate badge or icon once a gauge already carries it.

**The One Amber Rule.** `brew` is the only accent hue in the system outside the state vocabulary. It is not spent on decoration — only on the nominal glow and on primary actions.

## Typography

**Body/UI Font:** system sans stack (`ui-sans-serif, system-ui`) — unchanged from category default, deliberately not a webfont; nothing extra to load for a device meant to work on a weak connection.
**Numeral Font:** `ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace` — every live readout only.

**Character:** Plain system sans for everything that's prose or label; monospace tabular numerals reserved strictly for live instrument readings, so the two faces stay legible as two different kinds of information (words vs. measurements) rather than a stylistic pairing.

### Hierarchy
- **Headline** (600, 1.5rem/24px, uppercase, tracked 0.025em): page titles ("Your devices", a device name).
- **Title** (600, 0.875rem/14px, uppercase, tracked 0.05em): section headers (Alerts, Settings, chart titles).
- **Body** (400, 0.875rem/14px): device metadata, form copy, alert reasons.
- **Label** (500, 0.625rem/10px, uppercase, tracked 0.1em): gauge instrument labels (TEMP, GRAVITY, BATTERY) and device-type chips.
- **Numeral** (600, monospace, 1.125rem sm / 1.875rem lg, `font-variant-numeric: tabular-nums`): the live digit at a gauge's center. Fixed digit width so an update never reflows its label.

### Named Rules
**The Tabular Numerals Rule.** Every live-updating digit — gauge readouts, alert temperatures — uses the monospace stack with tabular-nums. This is a legibility mechanism (digits don't jitter in width as a value ticks over), not a "technical" costume, so it is never applied to static or non-numeric text.

## Layout

A single centered column (`max-w-3xl`, `mx-auto`, `px-4 py-8`) at every breakpoint — this is a monitoring tool for a handful of devices, not a dense dashboard grid. The device list breaks into instrument tiles: one column on mobile, two columns at `sm` and above. Spacing rhythm runs `gap-3`/`gap-4` between tight sibling elements (tile contents, form fields) and `mb-6`/`mb-8` between major sections; card interiors pad at `p-4` (list tiles, settings) or `p-6` (the detail hero panel).

**Focus-dim.** On the device grid, hovering or focusing one tile dims every other tile to 50% opacity over a 300ms transition — the raise borrowed from the streaming-catalog challenger. No badge or modal calls the focused tile out; the neighbors simply recede.

## Elevation & Depth

The system is flat by default — cards and panels carry a 1px border (`panel-700`) and no box-shadow. Depth and "liveness" are conveyed by glow, not shadow: a gauge's needle and dial center carry an SVG `drop-shadow` sized to the current state (0px offline, 3px nominal, 5px approaching, 9px breached), and an unacknowledged alert gets a small red halo (`0 0 6px 2px`) on its status dot. This is the instrument-panel material reading as lit from within rather than lifted off the page — a deliberate divergence from a generic shadow-elevation system, grounded in the OWN-WORLD's "amber-phosphor glow" mandate rather than a default.

### Named Rules
**The Flat-Except-Lit Rule.** Containers never cast a shadow. The only glow permitted anywhere is the state glow already defined per gauge/indicator — don't add ambient shadow or glow to a card, button, or chip that isn't reporting a live state.

## Shapes

Two radius steps: `6px` (buttons, inputs, chips — the interactive/small scale) and `8px` (cards, tiles, panels — the container scale). Full-round (`9999px`) only on the alert status dot. Borders are 1px and uniform — no accent-colored side borders on any list item or card. The gauge itself is the one non-rectangular silhouette in the system: a 240° dial (120° gap at the bottom, the classic speedometer face) rendered as a single SVG arc per instrument.

## Components

### Buttons
- **Shape:** 6px radius.
- **Primary:** `brew-600` (#a8631c) fill / white text, `hover:bg-brew-500`. Used for the one primary action per view (Claim device, Create device).
- **Secondary/Ghost:** transparent fill, 1px `panel-600` border, `panel-200` text, `hover:bg-panel-800`. Used for Cancel/Add-manually/Sign-out and settings actions.
- Both variants share `px-3 py-1.5 text-sm font-medium`; no size variant beyond this.

### Chips
- **Style:** `panel-800` background, `brew-400` uppercase tracked text, 10px label type, `rounded` (not pill). Used exclusively for the device-type badge ("TEMP + GRAVITY") next to a device name/ID — not used as a general-purpose tag.

### Cards / Containers
- **Corner Style:** 8px radius.
- **Background:** `panel-900` surface on `panel-950` page.
- **Shadow Strategy:** none — see Elevation & Depth; flat by default.
- **Border:** 1px `panel-700`, shifting to `brew-600` on hover for the interactive device tile only.
- **Internal Padding:** 16px (list tiles, settings sections) or 24px (detail-page hero panel).

### Inputs / Fields
- **Style:** `panel-950` fill, 1px `panel-600` border, 6px radius, `panel-200` text.
- **Focus:** global 2px `brew-400` outline with 2px offset (themed `:focus-visible`, not a browser default).
- **Error:** inline `breach-400` text beneath the field; no red border treatment observed.

### Navigation
- Minimal: a "← All devices" text link (`panel-400`, hover `panel-200`) is the only back-navigation; no persistent nav bar. Section headers use Title type; no active/hover state beyond the link's own color shift.

### Gauge (signature component)
The one component every surface composes. A 240°-sweep SVG dial: a static track (`panel-700` stroke), two faint red redline zones marking the device's own approach thresholds, six tick marks, an eased needle (700ms cubic-bezier) that pins at its travel limit rather than flying off-scale, and a tabular numeral + uppercase label positioned in the dial's actual clear zone below the arc's lower gap (not a naive full-box overlay — the hub sits at a fixed point regardless of needle angle, and the text has to stay clear of it in every state, not just the ones a screenshot happens to catch). Color and glow are driven entirely by `GaugeState` (nominal/approaching/breached/offline — see `lib/gaugeState.ts`); an offline gauge renders its numeral as "—" at 40% opacity instead of a stale value. Two sizes only: `sm` (112px, list tiles) and `lg` (224px, detail-page hero) — the freshness sub-label ("3m ago") only renders at `lg`, since the clear zone at `sm` holds the numeral and its label legibly but not a third line; staleness still reads through the gauge's own opacity at either size. A device that's overdue but not yet offline dims to 75% opacity rather than adopting a new hue — staleness is intensity, not a new signal. The `aria-label` states severity in words ("above maximum," "approaching threshold") alongside the number, not just the raw value, so the state the glow communicates to a sighted viewer also reaches a screen reader.

## Do's and Don'ts

### Do:
- **Do** use the four-state vocabulary (nominal/approaching/breached/offline) — and its paired glow intensity — for any future live-reading indicator, not just Gauge.
- **Do** keep every live-updating digit in the monospace tabular stack.
- **Do** keep containers flat (1px border, no shadow); reserve glow strictly for state signaling.
- **Do** theme browser-default surfaces (selection, scrollbar, focus ring) from the panel/amber palette rather than leaving them at browser defaults.

### Don't:
- **Don't** add a status badge or icon next to a gauge — the instrument already carries its own state.
- **Don't** introduce a second accent hue; amber is the only accent outside the state vocabulary.
- **Don't** add shadows, colored side-borders, or gradients to cards, chips, or buttons — those are not part of this system.
- **Don't** widen the gauge beyond its two sizes (sm/lg) or break its 240° dial into a full circle; the speedometer face is the signature silhouette.
