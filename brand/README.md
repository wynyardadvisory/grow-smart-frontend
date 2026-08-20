# Vercro brand masters

Canonical source artwork for the Vercro identity. **Everything else is generated from
these files** — favicons, PWA icons, Apple touch icons, iOS and Android app icons, splash
screens, the push badge and social imagery. Nothing in `public/`, `ios/` or `android/` is
hand-drawn, and nothing here is edited by hand.

Regenerate every platform asset with:

```bash
node brand/build-icons.mjs
```

Check them without regenerating:

```bash
node brand/build-icons.mjs --verify
```

`build-icons.mjs` renders each raster from the SVG **at its own final size** — nothing is
ever resized from another PNG. It then verifies, and exits non-zero on any failure:

- exact pixel dimensions for all 58 generated files
- **no alpha channel** on the iOS app icon, the iOS splashes and the Apple touch icons
  (App Store Connect rejects a build whose icon carries one)
- **alpha present** on the Android adaptive foregrounds and the push badge
- Android's 66-of-108dp safe zone — measured as the furthest opaque pixel from centre,
  because the guarantee is on the radius, not the bounding box
- the PWA maskable safe circle (central 80%)
- the frames actually inside `favicon.ico`
- every `icons[].src` in `manifest.json` resolves on disk
- no `"any maskable"` combined purpose, no pre-rebrand colour, no white adaptive background

If you change a master, run the generator — do not hand-edit anything it produces.

## The identity

`Vercro.` — the name set in **Newsreader**, followed by an **amber full stop**. The amber
dot is the brand signature: it appears as the sun/seed above the sprout in the mark, and as
the period after the name in the wordmark. It is never omitted from a visual lockup, and it
is never hand-written at a call site — `<VercroWordmark />` in `components/Brand.js` is the
only thing that draws it.

Ordinary prose says "Vercro", with no full stop. Page titles, alt text, FAQ copy and
accessible names are prose.

## Files

Every name says which **surface** the file is for, never the colour of the artwork:
`-on-dark` is the pale colourway *for use on* dark grounds.

| File | What it is | Used for |
|---|---|---|
| `vercro-mark-on-dark.svg` | The symbol alone, transparent, pale colourway | Dark surfaces — `C.surfaceDark`, Pro card, install banner |
| `vercro-mark-on-light.svg` | The symbol alone, transparent, pine colourway | Light surfaces — `C.paper`, white cards, headers |
| `vercro-app-icon.svg` | Mark on the approved `#0E2A2E` ground, full-bleed 1024 square | iOS/Android/web app icons, favicons, store uploads |
| `vercro-adaptive-foreground.svg` | Mark on a 432 canvas, art inside Android's 66/108 safe zone, transparent | Android adaptive-icon foreground layer |
| `vercro-wordmark-on-light.svg` | `Vercro.` outlined, ink letters | Static exports on light grounds |
| `vercro-wordmark-on-dark.svg` | `Vercro.` outlined, paper letters | Static exports on dark grounds |
| `vercro-lockup-on-light.svg` | Mark + wordmark, pine/ink | OG image, press, marketing |
| `vercro-lockup-on-dark.svg` | Mark + wordmark, pale/paper | OG image, press, marketing |

The mark is deliberately **not** welded to its dark square. Both mark files are transparent
so the symbol can sit directly on a card or header without stamping a small dark box inside
another surface. The square ground is a separate treatment and lives only in
`vercro-app-icon.svg`.

## On screen

`components/Brand.js` carries the same artwork as React — `<VercroMark>`, `<VercroWordmark>`
and `<VercroLogo>`. The masters here feed static exports; the components feed the screen.
They must not drift: `build-masters.py` and `Brand.js` hold the same numbers, and the lockup
constants (`MARK_TO_EM 1.37`, `GAP_TO_EM 0.40`, `CAP_NUDGE_EM -0.10`) are documented in both.

## Palette

| Token | Hex | Role |
|---|---|---|
| amber | `#D9A441` | The signature dot and full stop. Never substitute `C.amber` — that is the app's frost/overdue state colour and may be retuned independently |
| ground | `#0E2A2E` | App-icon ground only |
| leaf 1 / leaf 2 / stem (on dark) | `#EAF0EE` / `#C7D8CF` / `#A8C1B5` | |
| leaf 1 / leaf 2 / stem (on light) | `#24555F` / `#3E7F7A` / `#24555F` | `#24555F` is the app's `C.forest` |
| wordmark on light | `#13252F` | app `C.ink` |
| wordmark on dark | `#EAEFF2` | app `C.paper` |

## Provenance

The mark is the identity approved from v0 chat *"Vercro design audit"* (`zAYcJNxmuwF`),
19 Aug 2026. v0 produced it as inline SVG inside a throwaway sandbox page and never emitted
master files; the geometry here was recovered verbatim from that transcript.

Two production refinements were applied, both flagged by v0 itself and approved by Mark:

- **Amber dot** `cy 150 → 196`. It floated 53px clear of the leaves, more than 1.5× its own
  radius, and read as a separate object. Now 16px — a deliberate clearance.
- **Stem top** `250 → 306`. The stalk overshot the leaf junction by 58px, pushing a tongue
  up into the V with a background wedge either side. The stalk *below* the crown is
  unchanged at 80px, so the crown-to-stalk proportion is exactly as drawn.

Leaf paths, silhouette width, concept and palette are untouched.

The wordmark is outlined from the real Newsreader variable font at **weight 500**, tracking
**-0.01em**, with GPOS kerning applied (`V`+`e` = -156/2000 em). Weight and tracking match
the shipped `<Wordmark />` on vercro.com. Outlining matters because favicons, OG images and
store artwork rasterise in contexts where no webfont loads.

Fraunces appeared in the v0 concept render and is **not** part of the identity.
