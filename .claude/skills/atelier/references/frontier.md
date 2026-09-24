# Frontier moves

Pick **one** that serves the signature. Each ships with a fallback, respects reduced motion, and must survive a 320 px viewport. If a move doesn't come from the subject, it's a gimmick; skip it.

Check support before relying on anything newer than Baseline "widely available", and wrap it in `@supports`.

## Type as material

- **Variable axes driven by meaning.** Map `wght`, `wdth`, `opsz`, `slnt` or a custom axis to real data: a reading's intensity, a batch's age, a confidence level. `font-variation-settings` via a custom property set from JS or `attr()`.
- **Optical sizing on.** `font-optical-sizing: auto` with a face that has an `opsz` axis; display sizes get the display cut automatically.
- **Real numerals.** `font-variant-numeric: tabular-nums slashed-zero` for data; `oldstyle-nums proportional-nums` in prose. Dashboards live or die on this.
- **`text-wrap: balance`** for headings, **`text-wrap: pretty`** for paragraphs. Fallback is ordinary wrapping.
- **`hanging-punctuation`, `initial-letter`** for editorial surfaces (Safari-first; fallback is fine).
- **Metric-matched fallbacks.** `@font-face { size-adjust; ascent-override; descent-override }` so the swap causes no layout shift.

## Colour with intent

- **OKLCH tokens** with lightness steps that are perceptually even; derive states with `color-mix(in oklch, var(--accent) 80%, var(--ink))`.
- **Relative colour syntax** — `oklch(from var(--accent) calc(l - .1) c h)` — for hover/pressed without new hard-coded values.
- **Wide gamut, guarded.** `@media (color-gamut: p3)` to push chroma where the display supports it.
- **`light-dark()`** with `color-scheme` when both themes are genuinely designed, not auto-inverted.

## Layout that reacts to its container

- **Container queries** (`container-type: inline-size`, `@container`) so a component recomposes by the space it's given, not by viewport.
- **Subgrid** so titles, figures and footers align across a row of cards of unequal content.
- **`:has()`** for parent-aware composition: a card with an image lays out differently from one without, no extra class.
- **Asymmetric grids** named with `grid-template-areas` — a 5/7 or 2/3/7 split with deliberate white space beats 12 equal columns.
- **Fluid type and space** with `clamp()` tied to container units (`cqi`), not just `vw`.

## Motion that explains

- **View Transitions API** (`document.startViewTransition`, `view-transition-name`) so an item visibly becomes its detail view. Fallback: instant swap.
- **Scroll-driven animation** (`animation-timeline: view()` / `scroll()`) for one orchestrated reveal — a gauge filling as its section enters, a timeline drawing itself. Never on every section.
- **`@starting-style`** + `transition-behavior: allow-discrete` for dialogs/popovers entering from `display: none`.
- **Springs by `linear()` easing** for physical feel without bounce clichés.
- Everything in `@media (prefers-reduced-motion: no-preference)`; the reduced path shows the end state.

## Native primitives

- **Popover API** and **`<dialog>`** instead of hand-rolled overlays; **anchor positioning** (`anchor-name`, `position-anchor`) for tooltips that stay attached. Fallback to a fixed position.
- **Customisable `<select>`** (`appearance: base-select`) where supported; native select otherwise.

## Data as the hero

On operate surfaces the most distinctive move is often to let the real data carry the design:
- The live chart, not a marketing illustration, is the first thing seen.
- Sparklines inline with prose; small multiples instead of one crowded chart.
- Units, precision and uncertainty set typographically (a lighter weight for the last significant digit, a hairline band for tolerance).

## Surface and texture

- **SVG `feTurbulence` grain** at low opacity for a physical ground, generated not downloaded.
- **`mask-image` / `clip-path`** shapes derived from the subject (a meniscus curve, a label die-cut) rather than blobs.
- **Real photography or scans** of the subject's materials over stock or 3D renders.

## Guardrails

- One move. Everything around it is quiet.
- Measure: no CLS from the move, no long tasks on scroll, interaction under 200 ms.
- It must still read with CSS disabled and with a screen reader.
