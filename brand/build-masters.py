"""Build the canonical Vercro brand masters.

Geometry is the approved v0 mark with exactly two production refinements:
  · amber dot  cy 150 -> 196   (closes a 53px float to a 16px deliberate clearance)
  · stem top   250 -> 306      (removes a 58px overshoot that opened a notch in the V)
The stalk BELOW the leaf crown is unchanged at 80px, as are all leaf paths,
the silhouette width, the concept and the palette.
"""
import os, math
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.misc.transform import Transform

OUT = "/Users/mark/Desktop/Vercro/App Development/Code/grow-smart-frontend/brand"
os.makedirs(OUT, exist_ok=True)

# ── Palette ──────────────────────────────────────────────────────────────────
AMBER   = "#D9A441"   # the brand signature — dot in the mark, period in the wordmark
GROUND  = "#0E2A2E"   # approved app-icon ground (v0 "ink-teal")
INK     = "#13252F"   # app C.ink — wordmark on light grounds
PAPER   = "#EAEFF2"   # app C.paper — wordmark on dark grounds
D_LEAF1 = "#EAF0EE"; D_LEAF2 = "#C7D8CF"; D_STEM = "#A8C1B5"   # on dark
L_LEAF1 = "#24555F"; L_LEAF2 = "#3E7F7A"; L_STEM = "#24555F"   # on light (app pine)

# ── Mark geometry, normalised to a 200 x 222 box with 2 units of padding ─────
# (source 512-space coords minus (156,160))
MARK_VB = "0 0 200 222"
LEAF_L  = "M100 140 C 40 140 0 102 2 46 C 58 54 96 90 100 140 Z"
LEAF_R  = "M100 140 C 160 140 200 102 198 46 C 142 54 104 90 100 140 Z"
STEM_D  = "M100 212 L100 146"
DOT_CX, DOT_CY, DOT_R = 100, 36, 34

def mark_body(leaf1, leaf2, stem, dot=AMBER):
    return (f'<circle cx="{DOT_CX}" cy="{DOT_CY}" r="{DOT_R}" fill="{dot}"/>'
            f'<path d="{STEM_D}" stroke="{stem}" stroke-width="16" stroke-linecap="round" fill="none"/>'
            f'<path d="{LEAF_L}" fill="{leaf1}"/>'
            f'<path d="{LEAF_R}" fill="{leaf2}"/>')

def svg(vb, body, w=None, h=None, extra=""):
    dim = f' width="{w}" height="{h}"' if w else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{dim}{extra}>\n  '
            + body.replace("><", ">\n  <") + "\n</svg>\n")

def write(name, content):
    p = os.path.join(OUT, name)
    open(p, "w").write(content)
    print(f"  {name:34s} {len(content):5d} bytes")

HDR = "<!-- Vercro brand master — do not edit by hand. See brand/README.md -->\n"

print("MARK")
write("vercro-mark-on-dark.svg",
      HDR + svg(MARK_VB, mark_body(D_LEAF1, D_LEAF2, D_STEM),
                extra=' role="img" aria-label="Vercro"'))
write("vercro-mark-on-light.svg",
      HDR + svg(MARK_VB, mark_body(L_LEAF1, L_LEAF2, L_STEM),
                extra=' role="img" aria-label="Vercro"'))

# ── App-icon treatment: mark centred on the ground, scaled into Apple's grid ──
# Apple's icon grid puts key content at ~80% of the square; the mark is scaled so
# its greater dimension (222) fills 62% of 1024, then optically lifted by 1%.
ICON = 1024
scale = ICON * 0.62 / 222
mw, mh = 200 * scale, 222 * scale
tx, ty = (ICON - mw) / 2, (ICON - mh) / 2 - ICON * 0.012
icon_body = (f'<rect width="{ICON}" height="{ICON}" fill="{GROUND}"/>'
             f'<g transform="translate({tx:.2f},{ty:.2f}) scale({scale:.5f})">'
             f'{mark_body(D_LEAF1, D_LEAF2, D_STEM)}</g>')
print("APP ICON")
write("vercro-app-icon.svg",
      HDR + svg(f"0 0 {ICON} {ICON}", icon_body, ICON, ICON))

# Android adaptive foreground: a 108dp canvas of which launchers show the central
# 72dp, and only the central 66dp CIRCLE is guaranteed by every mask. Sizing the
# mark to the full 66dp would put its leaf tips outside that circle, because the
# guarantee is on the radius, not the bounding box. Scale instead so the mark fills
# the same 62% of the *visible* 72dp that it fills of the app icon's square — that
# gives visual parity across platforms and lands well inside the safe radius.
ADP = 432                       # 108dp @ xxxhdpi
s2 = (ADP * 0.62 * 72 / 108) / 222
aw, ah = 200 * s2, 222 * s2
adp_body = (f'<g transform="translate({(ADP-aw)/2:.2f},{(ADP-ah)/2:.2f}) scale({s2:.5f})">'
            f'{mark_body(D_LEAF1, D_LEAF2, D_STEM)}</g>')
write("vercro-adaptive-foreground.svg",
      HDR + svg(f"0 0 {ADP} {ADP}", adp_body, ADP, ADP))

# ── Wordmark, outlined from the real Newsreader ──────────────────────────────
SRC = ("/Users/mark/Desktop/Vercro/App Development/Code/grow-smart-frontend/"
       "out/_next/static/media/5f402bd2d8eef81a-s.p.b72f0478.woff2")
WEIGHT, TRACKING = 500, -0.01
font = instancer.instantiateVariableFont(TTFont(SRC), {"wght": WEIGHT})
upm  = font["head"].unitsPerEm
cmap = font.getBestCmap(); hmtx = font["hmtx"]; gs = font.getGlyphSet()
CAP  = font["OS/2"].sCapHeight

def kern_pairs():
    out = {}
    gpos = font["GPOS"].table
    idx = set()
    for fr in gpos.FeatureList.FeatureRecord:
        if fr.FeatureTag == "kern": idx.update(fr.Feature.LookupListIndex)
    for li in sorted(idx):
        lk = gpos.LookupList.Lookup[li]
        for st in lk.SubTable:
            if getattr(st, "ExtSubTable", None) is not None: st = st.ExtSubTable
            if not hasattr(st, "Coverage"): continue
            first = st.Coverage.glyphs
            if st.Format == 1:
                for g1, ps in zip(first, st.PairSet):
                    for r in ps.PairValueRecord:
                        v = getattr(r.Value1, "XAdvance", 0) or 0
                        if v: out[(g1, r.SecondGlyph)] = v
            elif st.Format == 2:
                c1, c2 = st.ClassDef1.classDefs, st.ClassDef2.classDefs
                for g1 in first:
                    k1 = c1.get(g1, 0)
                    if k1 >= len(st.Class1Record): continue
                    for g2, k2 in c2.items():
                        if k2 >= len(st.Class1Record[k1].Class2Record): continue
                        v = getattr(st.Class1Record[k1].Class2Record[k2].Value1, "XAdvance", 0) or 0
                        if v: out[(g1, g2)] = v
    return out
KERN = kern_pairs()

def place(text):
    out, x, prev = [], 0, None
    for ch in text:
        g = cmap[ord(ch)]
        if prev is not None:
            x += KERN.get((prev, g), 0) + TRACKING * upm
        out.append((g, x)); x += hmtx[g][0]; prev = g
    return out, x

def path_for(glyphs, tx, ty, sc):
    pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}")
    for g, dx in glyphs:
        gs[g].draw(TransformPen(pen, Transform(sc, 0, 0, -sc, (dx + tx) * sc, ty)))
    return pen.getCommands()

def ink_bounds(glyphs):
    xs = []; ys = []
    for g, dx in glyphs:
        bp = BoundsPen(gs); gs[g].draw(bp)
        if not bp.bounds: continue
        xs += [bp.bounds[0] + dx, bp.bounds[2] + dx]; ys += [bp.bounds[1], bp.bounds[3]]
    return min(xs), min(ys), max(xs), max(ys)

full, _  = place("Vercro.")
letters  = full[:-1]
period   = [full[-1]]
x0, y0, x1, y1 = ink_bounds(full)
PAD = 0.02 * upm
VW, VH = (x1 - x0) + 2 * PAD, (y1 - y0) + 2 * PAD
SC = 1.0
TX = -x0 + PAD
TY = (y1 + PAD)                      # baseline offset in the flipped space

def wordmark_svg(letter_fill):
    body = (f'<path d="{path_for(letters, TX, TY, SC)}" fill="{letter_fill}"/>'
            f'<path d="{path_for(period,  TX, TY, SC)}" fill="{AMBER}"/>')
    return HDR + svg(f"0 0 {VW:.0f} {VH:.0f}", body,
                     extra=' role="img" aria-label="Vercro"')

print("WORDMARK  (Newsreader wght 500, tracking -0.01em, GPOS kerning applied)")
write("vercro-wordmark-on-light.svg",        wordmark_svg(INK))
write("vercro-wordmark-on-dark.svg", wordmark_svg(PAPER))

# ── Lockup: mark + wordmark, mark centred on the cap-height band ─────────────
def lockup_svg(letter_fill, leaf1, leaf2, stem):
    cap_px   = CAP                                  # wordmark cap height, font units
    mark_h   = upm * 1.37                           # v0 lockup ratio: 52px mark to 38px type
    ms       = mark_h / 222
    mark_w   = 200 * ms
    gap      = upm * 0.40
    bl       = TY                                   # baseline y in flipped space
    mark_y   = bl - cap_px / 2 - mark_h / 2         # centre mark on the cap band
    wm_x     = mark_w + gap
    w        = wm_x + VW
    h        = max(VH, mark_y + mark_h + PAD)
    top      = min(0.0, mark_y)
    body = (f'<g transform="translate(0,{mark_y - top:.2f}) scale({ms:.5f})">'
            f'{mark_body(leaf1, leaf2, stem)}</g>'
            f'<g transform="translate({wm_x:.2f},{-top:.2f})">'
            f'<path d="{path_for(letters, TX, TY, SC)}" fill="{letter_fill}"/>'
            f'<path d="{path_for(period,  TX, TY, SC)}" fill="{AMBER}"/></g>')
    return HDR + svg(f"0 0 {w:.0f} {h - top:.0f}", body,
                     extra=' role="img" aria-label="Vercro"')

print("LOCKUP")
write("vercro-lockup-on-light.svg",        lockup_svg(INK,   L_LEAF1, L_LEAF2, L_STEM))
write("vercro-lockup-on-dark.svg", lockup_svg(PAPER, D_LEAF1, D_LEAF2, D_STEM))

print(f"\nwordmark viewBox {VW:.0f}x{VH:.0f} | cap {CAP} | upm {upm}")

# ── Monochrome badge master ──────────────────────────────────────────────────
# Android tints a notification badge to a flat colour using only its alpha, so a
# colour icon renders as a grey blob. This is the silhouette in white, inset so
# the system's own circular crop never clips a leaf tip.
BADGE = 96
_bs = BADGE * 0.78 / 222
_bw, _bh = 200 * _bs, 222 * _bs
badge_body = (f'<g transform="translate({(BADGE-_bw)/2:.2f},{(BADGE-_bh)/2:.2f}) scale({_bs:.5f})">'
              f'<circle cx="100" cy="36" r="34" fill="#FFFFFF"/>'
              f'<path d="{STEM_D}" stroke="#FFFFFF" stroke-width="16" stroke-linecap="round" fill="none"/>'
              f'<path d="{LEAF_L}" fill="#FFFFFF"/>'
              f'<path d="{LEAF_R}" fill="#FFFFFF"/></g>')
print("BADGE")
write("vercro-badge-mono.svg",
      HDR + svg(f"0 0 {BADGE} {BADGE}", badge_body, BADGE, BADGE))

# ── Open Graph master ────────────────────────────────────────────────────────
# 1200x630 is the size every unfurl crops toward. Content is kept inside a 96px
# margin so nothing important is lost when a client crops to a different ratio.
OG_W, OG_H = 1200, 630
HANKEN = ("/Users/mark/Desktop/Vercro/App Development/Code/grow-smart-frontend/"
          "out/_next/static/media/c47649aa31f9e140-s.p.7e59dfd6.woff2")
TAGLINE = "Know exactly what to do in your garden, every day"

hk = instancer.instantiateVariableFont(TTFont(HANKEN), {"wght": 400})
hk_upm, hk_cmap, hk_hmtx, hk_gs = (hk["head"].unitsPerEm, hk.getBestCmap(),
                                   hk["hmtx"], hk.getGlyphSet())

def hk_place(text):
    out, x = [], 0
    for ch in text:
        g = hk_cmap.get(ord(ch))
        if g is None:
            x += hk_upm * 0.25; continue
        out.append((g, x)); x += hk_hmtx[g][0]
    return out, x

def hk_path(glyphs, tx, ty, sc):
    pen = SVGPathPen(hk_gs, ntos=lambda v: f"{v:.2f}")
    for g, dx in glyphs:
        hk_gs[g].draw(TransformPen(pen, Transform(sc, 0, 0, -sc, (dx + tx) * sc, ty)))
    return pen.getCommands()

# Lockup, scaled to a 74px cap height and centred horizontally
og_cap   = 74
og_sc    = og_cap / CAP
og_markh = upm * 1.37 * og_sc
og_ms    = og_markh / 222
og_markw = 200 * og_ms
og_gap   = upm * 0.40 * og_sc
og_wmw   = VW * og_sc
og_total = og_markw + og_gap + og_wmw
og_x     = (OG_W - og_total) / 2
# Centre the lockup+tagline group optically: the group spans from the mark's top
# to the tagline's descenders, and its midpoint — not the lockup's baseline —
# is what should sit on the canvas centre.
og_baseline_y = OG_H / 2 + 5

tag_sz  = 34
tag_sc  = tag_sz / hk_upm
tag_g, tag_adv = hk_place(TAGLINE)
tag_x   = (OG_W - tag_adv * tag_sc) / 2
tag_y   = og_baseline_y + 96

og_body = (
  f'<rect width="{OG_W}" height="{OG_H}" fill="{PAPER}"/>'
  f'<g transform="translate({og_x:.2f},{og_baseline_y - og_cap/2 - og_markh/2:.2f}) scale({og_ms:.5f})">'
  f'{mark_body(L_LEAF1, L_LEAF2, L_STEM)}</g>'
  f'<g transform="translate({og_x + og_markw + og_gap:.2f},{og_baseline_y - TY*og_sc:.2f}) scale({og_sc:.5f})">'
  f'<path d="{path_for(letters, TX, TY, SC)}" fill="{INK}"/>'
  f'<path d="{path_for(period,  TX, TY, SC)}" fill="{AMBER}"/></g>'
  f'<path d="{hk_path(tag_g, 0, 0, tag_sc)}" fill="#445A65" transform="translate({tag_x:.2f},{tag_y:.2f})"/>'
  f'<rect x="0" y="{OG_H-10}" width="{OG_W}" height="10" fill="{AMBER}"/>'
)
print("OPEN GRAPH")
write("vercro-og.svg", HDR + svg(f"0 0 {OG_W} {OG_H}", og_body, OG_W, OG_H))
