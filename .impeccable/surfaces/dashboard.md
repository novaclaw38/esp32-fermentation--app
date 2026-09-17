---
version: 1
slug: "dashboard"
primary_target: "dashboard"
related_targets: []
---

## Direction contract

THESIS: The dashboard reads like a real instrument panel, not a status page — refuses the category default of stacked cards holding a plain number and a small badge.

OWN-WORLD: Dark charcoal panel ground (never pure black); amber-phosphor glow for nominal readings, reusing the existing "brew" amber as a glow instead of a flat fill; red reserved exclusively for alert state; dim desaturated gray for offline/unpowered. Tabular-numeral system monospace for every live digit so updates never jitter in width; small tracked uppercase labels per instrument; system sans elsewhere, unchanged. One SVG arc/needle per gauge, eased on update.

STORY: The owner scans the panel in under a second, sees which gauge glows red or sits dim, reads the exact digit at its center for precision, and can bring one gauge forward (neighbors dim) to focus on it.

FIRST VIEWPORT: The devices list becomes a grid of instrument tiles — one column on mobile, denser on wider screens — each tile a labeled radial gauge with its live numeral at center, glow color carrying alert/nominal/offline state directly on the instrument, not as a separate badge.

FORM: Aircraft/mission-control instrument panel. Assigned index 7 of 7 audience-grounded candidates (Inkbird-style temp controller, analog hydrometer, car dashboard, Nest-style thermostat, industrial gauge panel, test-bench oscilloscope, mission-control panel), seed key 5d187c4a. Three raises donated from declined/competitive challengers: alert-brightness hierarchy — an alert gauge glows measurably brighter than nominal, not just a color swap (from the cracktro scroller direction); focus-dim — the gauge grid dims non-focused tiles on hover/tap (from the streaming catalog wall); an explicit four-state vocabulary — nominal / approaching / breached / offline — rather than a binary ok/alert (from the tensegrity column).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
