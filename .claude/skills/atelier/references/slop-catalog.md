# Slop catalog

A tell is a default that appears whatever the subject. None is forbidden when the brief asks for it; all are forbidden as reflexes. IDs match `scripts/detect.mjs` output. ⚙ = the scanner can find it in code; 👁 = needs a render; 🧠 = judgement.

Severity: **P0** a layperson recognises it · **P1** a designer recognises it · **P2** craft gap.

## Why output converges

A model's first idea is the median of its training data. Banning the median just moves the median: the "tasteful" escape from purple-gradient SaaS became its own uniform. So there are two orders of default, and you must check both.

## Second order — the tasteful uniform

| ID | Tell | Sev | Why it reads as generated |
|---|---|---|---|
| SD1 | Cream ground (~#F4F1EA) + high-contrast serif + terracotta/clay accent (~#D97757) | P1 ⚙ | The Claude-interaction palette; appears on briefs that never mentioned warmth or craft. |
| SD2 | Near-black ground + one acid-green or vermilion accent | P1 ⚙ | The "developer tool" escape hatch, applied to everything. |
| SD3 | Broadsheet cosplay: hairline rules, zero radius, dense newspaper columns | P2 👁 | Editorial costume without editorial content. |
| SD4 | Template chrome: tracked ALL-CAPS eyebrows, `A · B · C` meta, `WORD — fragment` labels, mono for small labels, #0B0B0B for black | P1 ⚙ | Chrome that says "designed" without saying anything about the content. |
| SD5 | One word accented in the headline (italic, colour, serif swap) | P1 ⚙ | The single most reliable headline tell. |
| SD6 | Decorative 01 / 02 / 03 markers on content that isn't a sequence | P1 ⚙ | Numbering is information; used as ornament it lies. |
| SD7 | Fake window chrome: traffic-light dots, URL pills, phone bezels | P2 ⚙ | Re-draws chrome the viewer already has. |
| SD8 | The purple-escape accent (swapping indigo for a near-identical violet/teal) | P2 ⚙ | A token swap, not a decision. |

## First order — the median

**Typography**
- T1 Inter or system stack for everything · P0 ⚙
- T2 The tasteful-free-font shortlist (Space Grotesk, DM Sans, Instrument Serif, Fraunces, JetBrains Mono as label face…) chosen by reflex · P1 ⚙
- T3 Serif-italic accent word in a sans headline · P1 ⚙
- T4 Untouched Geist on a Next.js site · P1 ⚙
- T5 All-caps eyebrow above every heading · P1 ⚙
- T6 One family, one weight, flat scale — no hierarchy · P2 👁
- T7 A face declared in CSS but never loaded · P1 ⚙

**Colour**
- C1 Purple/indigo→blue diagonal gradient · P0 ⚙
- C2 Indigo/violet primary buttons · P1 ⚙
- C3 "Vibe-code purple" dark theme · P1 👁
- C4 Timid, evenly weighted palette with no dominant colour · P0/P1 👁
- C5 Coloured glow shadows · P2 ⚙
- C6 Gradient-clipped headline text · P0 ⚙
- C7 Dark mode nobody asked for · P1 🧠
- C8 Two "colours" that are one hue at two lightnesses · P2 ⚙
- C9 Muted text below WCAG AA · P1 ⚙👁 — treat as an accessibility defect

**Layout**
- L1 Centred hero: pill badge, big headline, sub, two buttons · P0 ⚙
- L2 Three identical icon-topped feature cards · P0 ⚙
- L3 Bento grid as default composition · P1/P2 🧠
- L4 Invented stat strip / logo wall · P1 ⚙
- L5 "How it works" 1-2-3 · P2 🧠
- L6 Default page shell (sticky blurred nav, max-w-7xl, centred everything) · P1 ⚙
- L7 Three pricing tiers with a "Most popular" ring · P1 ⚙
- L8 Four-column link footer · P1 ⚙
- L9 Cookie-cutter section order — fails the silhouette test · P1 ⚙👁

**Components**
- K1 Untouched shadcn/ui · P0 ⚙
- K2 `rounded-2xl shadow-lg` on every surface; one radius for all hierarchy levels · P1 ⚙
- K3 Glassmorphism / `backdrop-blur` by reflex · P1 ⚙
- K4 Coloured left/top border-accent cards · P1 ⚙
- K5 Pill badge above the title · P2 ⚙
- K6 Icon in a tinted rounded square · P1 ⚙
- K7 Missing states (focus, disabled, loading, error, empty) · P1 ⚙
- K8 Untouched `--radius` · P1 ⚙
- K9 Default dark SaaS card (#111, 1px #222 border) · P1 ⚙
- K10 Stock effect-library components (spotlight, meteors, beams) · P1 ⚙
- K11 Cards inside cards · P2 👁
- K12 Status-chip soup · P2 👁

**Spacing** — S1 Uniform padding everywhere, no rhythm or grouping · P2 👁

**Motion**
- M1 Same fade-up-on-scroll on every section · P2 ⚙
- M2 Scattered hover effects with no orchestration · P2 👁
- M3 Copied "Linear glow" border · P2 👁
- M4 Bounce / elastic easing · P2 ⚙
- M5 Count-up numbers · P2 ⚙
- M6 Motion ignoring `prefers-reduced-motion` · P1 ⚙ — accessibility defect

**Icons** — I1 Lucide untouched at default stroke · I2 Emoji as bullets or nav · P1 ⚙ · I3 The overused glyph set (Sparkles, Zap, Rocket, Shield) · P1 ⚙

**Copy**
- CP1 Vague aspirational headline ("Elevate your workflow") · P1 ⚙
- CP2 Superlatives and hedges ("seamless", "powerful", "effortlessly") · P2 ⚙
- CP3 `→` stapled to links and buttons · P1 ⚙
- CP4 Tricolon slogans ("Fast. Simple. Secure.") · P2 ⚙
- CP5 Title Case Everything · P2 🧠
- CP6 Generic CTA ("Get started", "Learn more", "Submit") · P2 ⚙

**Imagery** — IM1 Stock team-at-laptop · IM2 Glossy 3D blobs · IM3 Corporate Memphis · IM4 Placeholder names/avatars shipped (Jane Doe, pravatar) · P1

**Fingerprints** — F1 Generator signature or comment left in · P1 ⚙

## Structural sameness

Two briefs should not produce the same rhythm. Before building, name the macrostructure you're using and check it isn't the one you used last time. Options that aren't the default landing page: long document, manifesto, specimen, catalogue, index-first, letter, workbench (the tool *is* the page), stat-led with real data, map/diagram-led, narrative workflow, quote-led, portfolio grid, split studio, conversational FAQ.

## The fix is not the neighbour

Replacing purple with teal, Inter with Space Grotesk, or cream with near-black clears the scanner and fails the brief. The fix comes from the subject (SKILL.md step 1), not from the next item on a style menu.
