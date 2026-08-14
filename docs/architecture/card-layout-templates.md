# Card layout templates

Game cards use 12 fixed numerical templates from `lib/card-layout.ts`. Each
template defines eight symbol centers, sizes, base rotations, and conservative
collision radii in a normalized card whose center is `(0, 0)` and radius is
`1`. The card component enforces the validator's 288px minimum rendered
diameter; changing that responsive floor requires updating and revalidating the
target geometry.

Visible symbol sizes deliberately span `0.076` through `0.2` of the card
diameter so every layout has a clear hierarchy instead of eight similarly sized
glyphs. The renderer permits that smallest authored value to render at roughly
24px on the minimum card, while collision radii remain independently large
enough to provide a 48px minimum tap target.

The templates are generated offline with:

```bash
pnpm card-layout:generate
```

The generator uses deterministic seeds, begins with random points inside the
card, and repeatedly separates overlapping collision circles and pulls escaped
circles back inside the card. It produces 300 candidates per template and
selects a balanced candidate with strong horizontal and vertical coverage. Its
generation clearances are intentionally larger than the runtime validation
constants so rounding the committed coordinates does not erase the safety
margin.

Generation never runs in the browser. Candidate output must be visually
reviewed before it is copied into `CARD_LAYOUT_TEMPLATES`. The committed data is
then protected by unit tests that require:

- exactly eight slots per template;
- a 48px target at the smallest supported card diameter;
- a collision circle at least 1.5 times the normalized font size, large enough
  to contain freely rotated square glyph boxes and unusually wide platform
  emoji;
- pairwise collision-radius clearance plus the configured breathing-room gap;
- collision-radius clearance from the circular card edge;
- the same invariants after non-right-angle whole-template rotations.

Small reviewed coordinate and size corrections may be recorded in the
generator's `CURATED_ADJUSTMENTS` and `CURATED_SIZE_OVERRIDES` maps when browser
review finds a sparse quadrant or a weak size hierarchy. Those corrections are
part of the reproducible output and must pass the same numerical validation.

To replace or add a template, update the generator's stable template names and
seeds, inspect the rendered candidates, copy the chosen numerical output, and
run the complete test suite. Do not add runtime jitter to a validated template.
