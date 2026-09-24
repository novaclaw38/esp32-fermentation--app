# Pre-ship critique

Score the rendered result (or the code, if you cannot render — say so) on six axes, 1–5. Any score below 3 triggers one revision pass, then one re-score. Report the final scores with one line of evidence each.

| Axis | 1 | 3 | 5 |
|---|---|---|---|
| **Grounding** — does every choice trace to the subject? | Could be any product | Palette or type is on-subject, the rest is generic | Someone could guess the subject from a blurred screenshot |
| **Hierarchy** — one focal point, then a clear reading order | Everything shouts or nothing does | Clear primary, muddy secondary | The eye lands, then travels exactly where intended |
| **Specificity** — free of first- and second-order defaults | Several P0 tells | No P0; some unsanctioned P1 | No unsanctioned tells; the fixes weren't neighbour-swaps |
| **Restraint** — boldness spent once | Three competing ideas | One idea plus leftover decoration | One idea; everything else disciplined; one thing removed before ship |
| **Craft** — spacing rhythm, alignment, numerals, states, measure | Uniform padding, missing states | Mostly consistent, some gaps | Rhythm is deliberate; all states and empty states designed |
| **Floor** — responsive, accessible, fast | Breaks at 320 px or fails contrast | Works, with minor issues | 320–1440 px clean, AA contrast, visible focus, reduced motion, no CLS |

## Tests that aren't numbers

- **Silhouette.** Reduce the screenshot to grey blocks. If it matches the generic landing page, Specificity can't exceed 3.
- **Swap.** Replace the product name with a competitor's. If nothing else needs to change, Grounding can't exceed 2.
- **Squint.** At 25% there must be one obvious focal point.
- **Remove one.** Name the element you removed before shipping. If you can't, Restraint can't exceed 3.
- **Honesty.** Any invented number, logo or testimonial fails the whole critique.

## Stamp

For pages, leave a short comment at the top of the main stylesheet or component:

```css
/* atelier · subject: <one line> · signature: <one line> · G4 H5 S4 R5 C4 F5 */
```
