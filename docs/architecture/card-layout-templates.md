# Card layout templates

Game cards use 12 fixed numerical templates from `lib/card-layout.ts`. Each
template defines eight symbol centers, sizes, and conservative collision radii
in a normalized card whose center is `(0, 0)` and radius is `1`. The card
component enforces the validator's 288px minimum rendered diameter; changing
that responsive floor requires updating and revalidating the target geometry.

## Spatial rotation versus glyph rotation

Card planning separates two independent orientation systems:

- **Spatial template rotation** turns the whole template's slot centers around
  the card center (`rotateCardLayoutSlot`). Positions move through the full
  360°; sizes and collision radii never change.
- **Glyph rotation profiles** (`CARD_ROTATION_PROFILES`) decide how each symbol
  leans. A plan deterministically selects one eight-angle profile from stable
  pair/card inputs and permutes its angles across the card's symbols. The
  spatial rotation is never added to glyph angles, so a rotated card never ends
  with every icon leaning in the same direction.

Each curated profile keeps four or five angles mostly upright (within ±20° of
vertical) and spends the rest on moderate (20°–60°) and strong (>60°) tilts.
`validateRotationProfile` guards those bands, requires at least one moderate
and two strong tilts, and rejects any ±20° window that contains six or more
angles. The profiles are intentionally varied — different upright counts,
angle sets, and orderings — rather than statistically uniform. The selected
profile is exposed through the card's `data-rotation-profile` attribute and
shown in the `/dev/card-layouts` gallery.

Symbol plans apply `normalizeRotation` to profile angles, which keeps every
rendered rotation inside `(-180, 180)` and avoids `-180` exactly, dodging a
WebKit paint failure for transformed color emoji.

## Templates

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
validated immediately after rounding and curated overrides, before it is
printed, and is then protected by unit tests that require:

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

To add a glyph-orientation profile, append a curated eight-angle entry to
`CARD_ROTATION_PROFILES` that satisfies `validateRotationProfile`, confirm the
gallery balance visually, and extend the numerical tests. Do not generate
angles at runtime or derive them from the spatial rotation.
