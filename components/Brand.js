/**
 * The Vercro identity — the only place the brand is drawn.
 *
 * Three components and one token object. Nothing else in the app draws a Vercro
 * lockup, and in particular nothing else writes an amber full stop: the dot is a
 * real typographic period living inside VercroWordmark, so a call site never has
 * to position or colour one.
 *
 * Geometry here is the same artwork as brand/vercro-mark-on-dark.svg. The SVG
 * masters feed every static export (favicons, PWA icons, store icons, splash
 * screens, social imagery); these components feed the screen. They must not
 * drift — brand/build-masters.py regenerates the masters from the same numbers.
 *
 * The mark is deliberately NOT welded to its dark square. The square ground is an
 * app-icon treatment and lives only in brand/vercro-app-icon.svg. Stamping it into
 * a card or header would put a small dark box inside another surface.
 *
 * Accessibility: the wordmark's letters are real text, so a screen reader reads
 * "Vercro" naturally. The period carries aria-hidden, so nothing announces "full
 * stop". The mark is decorative in every current placement — it always sits beside
 * text that already names the brand — so its SVG is aria-hidden too.
 */
import { F } from "@/lib/fonts";

// The approved palette. AMBER is deliberately its own token and not C.amber:
// C.amber is the app's frost/overdue attention colour and may be retuned on its
// own schedule. The brand signature must not move when a state colour does.
export const BRAND = {
  amber:  "#D9A441",
  ground: "#0E2A2E", // app-icon ground — not used on screen
  ink:    "#13252F",
  pine:   "#24555F",
  paper:  "#EAEFF2",
  onDark:  { leaf1: "#EAF0EE", leaf2: "#C7D8CF", stem: "#A8C1B5" },
  onLight: { leaf1: "#24555F", leaf2: "#3E7F7A", stem: "#24555F" },
};

// Source geometry, 200 x 222 with 2 units of padding. See brand/README.md for
// what the two production refinements were and why.
const MARK_W = 200;
const MARK_H = 222;
const LEAF_L = "M100 140 C 40 140 0 102 2 46 C 58 54 96 90 100 140 Z";
const LEAF_R = "M100 140 C 160 140 200 102 198 46 C 142 54 104 90 100 140 Z";

// Lockup metrics, both taken from the approved v0 lockup and from Newsreader's
// own metrics — see the constants' comments before changing either.
const MARK_TO_EM = 1.37;  // v0 drew a 52px mark against 38px type
const GAP_TO_EM  = 0.40;
// With line-height:1 Newsreader's baseline sits 0.735em below the top of the line
// box and its cap height is 0.67em, so the cap band centres at 0.40em — while
// align-items:center centres on 0.50em. This is the difference.
const CAP_NUDGE_EM = -0.10;

/**
 * The symbol alone, transparent.
 * `size` is the mark's height in px; width follows the 200:222 ratio.
 * `tone` names the surface it sits on, not the colour of the artwork:
 * "onDark" is the pale colourway, "onLight" the pine one.
 */
export function VercroMark({ size = 28, tone = "onLight", style }) {
  const c = BRAND[tone] || BRAND.onLight;
  return (
    <svg
      viewBox={`0 0 ${MARK_W} ${MARK_H}`}
      width={(size * MARK_W) / MARK_H}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", flexShrink: 0, ...style }}
    >
      <circle cx="100" cy="36" r="34" fill={BRAND.amber} />
      <path d="M100 212 L100 146" stroke={c.stem} strokeWidth="16" strokeLinecap="round" fill="none" />
      <path d={LEAF_L} fill={c.leaf1} />
      <path d={LEAF_R} fill={c.leaf2} />
    </svg>
  );
}

const WORDMARK_COLOUR = { ink: BRAND.ink, pine: BRAND.pine, onDark: BRAND.paper };

/**
 * "Vercro" in Newsreader followed by the amber full stop.
 * `size` is the font size in px. `tone` is "ink" | "pine" | "onDark".
 *
 * Weight 500 and tracking -0.01em match the shipped wordmark on vercro.com; they
 * are fixed here rather than inherited so the wordmark is identical wherever it
 * appears, including inside headings that carry their own type tokens.
 */
export function VercroWordmark({ size = 20, tone = "ink", style }) {
  return (
    <span
      style={{
        fontFamily: F.display,
        fontWeight: 500,
        fontSize: size,
        letterSpacing: "-0.01em",
        lineHeight: 1,
        color: WORDMARK_COLOUR[tone] || BRAND.ink,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      Vercro
      <span aria-hidden="true" style={{ color: BRAND.amber }}>.</span>
    </span>
  );
}

/**
 * Mark + wordmark, the full lockup. `size` is the wordmark's font size in px;
 * the mark scales from it, so one number sets the whole thing.
 */
export function VercroLogo({ size = 20, tone = "onLight", style }) {
  const markTone = tone === "onDark" ? "onDark" : "onLight";
  const wordTone = tone === "onDark" ? "onDark" : "ink";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * GAP_TO_EM, ...style }}>
      <VercroMark
        size={size * MARK_TO_EM}
        tone={markTone}
        style={{ transform: `translateY(${size * CAP_NUDGE_EM}px)` }}
      />
      <VercroWordmark size={size} tone={wordTone} />
    </span>
  );
}

/* ── Canvas ────────────────────────────────────────────────────────────────────
 *
 * The share cards are drawn into a <canvas> and downloaded as a PNG, so they
 * cannot use the components above. These draw the same geometry and the same
 * type, from the same constants, so the exported image and its on-screen preview
 * cannot drift apart.
 *
 * Deliberately no <img src="/brand/...svg"> here: an image load is asynchronous,
 * can taint the canvas, and resolves against a capacitor:// origin inside the
 * native apps. Path2D draws the identical vector with none of that.
 */

/**
 * Load the brand faces before anything is drawn.
 *
 * Canvas silently substitutes a fallback for a font that has not finished
 * loading — there is no error and no retry. That is exactly what the cards were
 * already doing: they asked for Georgia, which is not a Vercro face and is not
 * installed on Android at all, so the branding rendered in whatever the platform
 * picked. Always await this before the first fillText.
 */
export async function ensureBrandFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`500 40px ${F.display}`, "Vercro."),
      document.fonts.load(`600 72px ${F.display}`, "Harvest"),
      document.fonts.load(`400 36px ${F.body}`, "Grown with"),
    ]);
    await document.fonts.ready;
  } catch {
    // A missing face is better than a card that never renders.
  }
}

/** Canvas font shorthands, so no call site hand-writes a family string. */
export const BRAND_FONT = {
  display: (px, weight = 600) => `${weight} ${px}px ${F.display}`,
  body:    (px, weight = 400) => `${weight} ${px}px ${F.body}`,
};

/** Draw the mark with its top-left at (x, y). Returns the width it occupied. */
export function drawVercroMark(ctx, { x, y, height, tone = "onDark" }) {
  const c = BRAND[tone] || BRAND.onDark;
  const s = height / MARK_H;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.arc(100, 36, 34, 0, Math.PI * 2);
  ctx.fillStyle = BRAND.amber;
  ctx.fill();
  ctx.strokeStyle = c.stem;
  ctx.lineWidth = 16;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(100, 212);
  ctx.lineTo(100, 146);
  ctx.stroke();
  ctx.fillStyle = c.leaf1;
  ctx.fill(new Path2D(LEAF_L));
  ctx.fillStyle = c.leaf2;
  ctx.fill(new Path2D(LEAF_R));
  ctx.restore();
  return height * (MARK_W / MARK_H);
}

/** Measure the wordmark without drawing it — for centring a lockup. */
export function measureVercroWordmark(ctx, size) {
  ctx.save();
  ctx.font = BRAND_FONT.display(size, 500);
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${-0.01 * size}px`;
  const w = ctx.measureText("Vercro.").width;
  ctx.restore();
  return w;
}

/**
 * Draw "Vercro" + the amber period, left edge at x, sitting on baseline y.
 * The period is placed from the measured width of the name rather than drawn as
 * part of one string, because it is the only glyph that takes the accent colour.
 */
export function drawVercroWordmark(ctx, { x, y, size, colour = BRAND.paper }) {
  ctx.save();
  ctx.font = BRAND_FONT.display(size, 500);
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${-0.01 * size}px`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = colour;
  ctx.fillText("Vercro", x, y);
  const nameW = ctx.measureText("Vercro").width;
  ctx.fillStyle = BRAND.amber;
  ctx.fillText(".", x + nameW, y);
  const total = nameW + ctx.measureText(".").width;
  ctx.restore();
  return total;
}

/**
 * The full lockup as one centred row: mark + wordmark, optionally preceded by a
 * line of prose ("Grown with"). `cx` is the centre, `baseline` the type baseline.
 */
export function drawVercroLockup(ctx, { cx, baseline, size, tone = "onDark", prefix = null }) {
  const markH = size * MARK_TO_EM;
  const markW = markH * (MARK_W / MARK_H);
  const gap = size * GAP_TO_EM;
  const wordW = measureVercroWordmark(ctx, size);

  let prefixW = 0;
  const prefixSize = size * 0.8;
  if (prefix) {
    ctx.save();
    ctx.font = BRAND_FONT.body(prefixSize);
    prefixW = ctx.measureText(prefix).width + gap;
    ctx.restore();
  }

  const total = prefixW + markW + gap + wordW;
  let x = cx - total / 2;

  if (prefix) {
    ctx.save();
    ctx.font = BRAND_FONT.body(prefixSize);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = tone === "onDark" ? "rgba(255,255,255,0.7)" : BRAND.ink;
    ctx.fillText(prefix, x, baseline);
    ctx.restore();
    x += prefixW;
  }

  // Centre the mark on the cap band, matching CAP_NUDGE_EM on screen.
  const capH = size * 0.67;
  drawVercroMark(ctx, { x, y: baseline - capH / 2 - markH / 2, height: markH, tone });
  x += markW + gap;

  drawVercroWordmark(ctx, {
    x, y: baseline, size,
    colour: tone === "onDark" ? BRAND.paper : BRAND.ink,
  });
  return total;
}
